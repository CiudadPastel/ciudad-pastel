import { randomUUID } from "node:crypto";

import { COURSE_STATUS } from "../models/course.model.js";
import {
    CONFIRMABLE_ENROLLMENT_REQUEST_STATUSES,
    ENROLLMENT_REQUEST_STATUS
} from "../models/enrollment-request.model.js";
import {
    ENROLLMENT_ERROR_CODE,
    ENROLLMENT_STATUS,
    VALID_PAYMENT_STATUSES,
    buildEnrollment,
    isValidPaymentStatus
} from "../models/enrollment.model.js";
import {
    validateConfirmRequestInput,
    validateEnrollmentInput,
    validateEnrollmentListFilters,
    validateEnrollmentUpdateInput
} from "../validators/enrollment.validator.js";
import { normalizeDigits } from "../validators/enrollment-request.validator.js";
import { getCourseById as getCourseByIdRepository } from "../repositories/course.repository.js";
import { getEnrollmentRequestById as getEnrollmentRequestByIdRepository } from "../repositories/enrollment-request.repository.js";
import {
    createEnrollment as createEnrollmentRepository,
    getActiveEnrollmentsByIdNumber,
    getEnrollmentById as getEnrollmentByIdRepository,
    getEnrollmentsByCourse as getEnrollmentsByCourseRepository,
    updateEnrollment as updateEnrollmentRepository,
    updateEnrollmentPaymentStatus as updateEnrollmentPaymentStatusRepository
} from "../repositories/enrollment.repository.js";

function namedError(name, message, { details, code } = {}) {
    const error = new Error(message);
    error.name = name;
    if (details) error.details = details;
    if (code) error.code = code;
    return error;
}

const isActive = (enrollment) => enrollment.status === ENROLLMENT_STATUS.ENROLLED;

/* ---------- Rules (run inside the Firestore transaction) ---------- */

// The course must exist and not be archived.
function assertCourseAcceptsEnrollments(course) {
    if (!course) {
        throw namedError("NotFoundError", "Course not found.");
    }
    if (course.status === COURSE_STATUS.ARCHIVED) {
        throw namedError("ConflictError", "Archived courses do not accept enrollments.", {
            code: ENROLLMENT_ERROR_CODE.COURSE_ARCHIVED
        });
    }
}

// A person cannot have two active enrollments in the same course.
function assertNotEnrolled(enrollments, idNumber, ignoreId = null) {
    if (enrollments.some((e) => isActive(e) && e.idNumber === idNumber && e.id !== ignoreId)) {
        throw namedError("ConflictError", "This person is already enrolled in this course.", {
            code: ENROLLMENT_ERROR_CODE.ALREADY_ENROLLED
        });
    }
}

// Active enrollments cannot exceed the course capacity (no capacity = no limit).
function assertHasSpot(course, enrollments, ignoreId = null) {
    if (course.capacity === undefined || course.capacity === null) return;

    const active = enrollments.filter((e) => isActive(e) && e.id !== ignoreId).length;
    if (active >= course.capacity) {
        throw namedError("ConflictError", "The course is full.", {
            code: ENROLLMENT_ERROR_CODE.COURSE_FULL
        });
    }
}

function assertRequestConfirmable(request) {
    if (!request) {
        throw namedError("NotFoundError", "Enrollment request not found.");
    }
    if (request.status === ENROLLMENT_REQUEST_STATUS.CONFIRMED) {
        throw namedError("ConflictError", "This enrollment request was already confirmed.", {
            code: ENROLLMENT_ERROR_CODE.REQUEST_ALREADY_CONFIRMED
        });
    }
    if (!CONFIRMABLE_ENROLLMENT_REQUEST_STATUSES.includes(request.status)) {
        throw namedError("ConflictError", "A discarded request must be moved back to pending before confirming it.", {
            code: ENROLLMENT_ERROR_CODE.REQUEST_DISCARDED
        });
    }
}

/* ---------- Use cases ---------- */

/**
 * Registers a student manually (HU-A09), e.g. someone who wrote by WhatsApp.
 * If the person had a pending or contacted request for this course, it is
 * marked as confirmed so it is not processed twice.
 */
export async function registerEnrollment(courseId, input) {
    const validation = validateEnrollmentInput(input);
    if (!validation.valid) {
        throw namedError("ValidationError", "Enrollment validation failed.", { details: validation.errors });
    }

    const course = await getCourseByIdRepository(courseId);
    assertCourseAcceptsEnrollments(course);

    const enrollment = buildEnrollment({
        id: randomUUID(),
        courseId: course.id,
        courseName: course.name,
        ...validation.data
    });

    return createEnrollmentRepository(enrollment, {
        validate: ({ course: current, enrollments, requests }) => {
            assertCourseAcceptsEnrollments(current);
            assertNotEnrolled(enrollments, enrollment.idNumber);
            assertHasSpot(current, enrollments);

            return requests.find((r) =>
                r.idNumber === enrollment.idNumber && CONFIRMABLE_ENROLLMENT_REQUEST_STATUSES.includes(r.status)
            ) ?? null;
        }
    });
}

/**
 * Creates the enrollment from an existing request with its data. The
 * administrator may correct the data and add a note (e.g. "Pagó por SINPE").
 */
export async function confirmEnrollmentRequest(requestId, input) {
    const request = await getEnrollmentRequestByIdRepository(requestId);
    assertRequestConfirmable(request);

    const validation = validateConfirmRequestInput(input, request);
    if (!validation.valid) {
        throw namedError("ValidationError", "Enrollment validation failed.", { details: validation.errors });
    }

    const course = await getCourseByIdRepository(request.courseId);
    assertCourseAcceptsEnrollments(course);

    const enrollment = buildEnrollment({
        id: randomUUID(),
        courseId: course.id,
        courseName: course.name,
        enrollmentRequestId: request.id,
        ...validation.data
    });

    return createEnrollmentRepository(enrollment, {
        enrollmentRequestId: request.id,
        validate: ({ course: current, enrollments, request: currentRequest }) => {
            // Checked again inside the transaction in case it changed meanwhile
            assertRequestConfirmable(currentRequest && { ...currentRequest, id: request.id });
            assertCourseAcceptsEnrollments(current);
            assertNotEnrolled(enrollments, enrollment.idNumber);
            assertHasSpot(current, enrollments);
            return { id: request.id };
        }
    });
}

// Enrollments of a course (?status=enrolled|cancelled), active first.
export async function getCourseEnrollments(courseId, query) {
    const filters = validateEnrollmentListFilters(query);
    if (!filters.valid) {
        throw namedError("ValidationError", "Invalid enrollment filters.", { details: filters.errors });
    }

    const course = await getCourseByIdRepository(courseId);
    if (!course) {
        throw namedError("NotFoundError", "Course not found.");
    }

    const enrollments = (await getEnrollmentsByCourseRepository(courseId))
        .filter((e) => !filters.data.status || e.status === filters.data.status)
        .sort((a, b) =>
            (isActive(a) ? 0 : 1) - (isActive(b) ? 0 : 1) ||
            (a.confirmedAt ?? "").localeCompare(b.confirmedAt ?? "")
        );

    return enrollments;
}

/**
 * Corrects an enrollment's data, changes its note, cancels it (frees a spot)
 * or enrolls it again (needs a free spot and no other active enrollment).
 */
export async function updateEnrollment(id, input) {
    const updated = await updateEnrollmentRepository(id, ({ enrollment, course, enrollments }) => {
        const validation = validateEnrollmentUpdateInput(input, enrollment);
        if (!validation.valid) {
            throw namedError("ValidationError", "Enrollment validation failed.", { details: validation.errors });
        }

        const changes = validation.data;
        const result = { ...enrollment, ...changes };

        if (isActive(result)) {
            assertNotEnrolled(enrollments, result.idNumber, enrollment.id);

            // Reactivating a cancelled enrollment takes a spot again
            if (!isActive(enrollment)) {
                assertCourseAcceptsEnrollments(course);
                assertHasSpot(course, enrollments, enrollment.id);
            }
        }

        return changes;
    });

    if (!updated) {
        throw namedError("NotFoundError", "Enrollment not found.");
    }

    return updated;
}

/**
 * Retrieves a single enrollment by ID (HU-A09 / HU-A07).
 */
export async function getEnrollment(id) {
    const enrollment = await getEnrollmentByIdRepository(id);
    if (!enrollment) {
        throw namedError("NotFoundError", "Enrollment not found.");
    }
    return enrollment;
}

/**
 * Updates the payment status of an enrollment by authorized staff (HU-A07).
 * Validates paymentStatus, updates paymentUpdatedAt and paymentUpdatedBy,
 * and returns the updated enrollment.
 */
export async function updatePaymentStatus(enrollmentId, paymentStatus, user) {
    if (!paymentStatus || typeof paymentStatus !== "string" || !isValidPaymentStatus(paymentStatus)) {
        throw namedError(
            "ValidationError",
            `paymentStatus must be one of: ${VALID_PAYMENT_STATUSES.join(", ")}.`,
            { details: [`paymentStatus must be one of: ${VALID_PAYMENT_STATUSES.join(", ")}.`] }
        );
    }

    const updated = await updateEnrollmentPaymentStatusRepository(enrollmentId, {
        paymentStatus,
        paymentUpdatedBy: user?.uid ?? null
    });

    if (!updated) {
        throw namedError("NotFoundError", "Enrollment not found.");
    }

    return updated;
}

/**
 * Reusable lookup for HU-A06 (recipe book access): finds the active
 * enrollments of a person by ID number AND phone, optionally in one course.
 * Returns an empty list when the person is not enrolled.
 */
export async function findActiveEnrollments({ idNumber, phone, courseId } = {}) {
    const id = normalizeDigits(idNumber);
    const tel = normalizeDigits(phone);
    if (!id || !tel) return [];

    const enrollments = await getActiveEnrollmentsByIdNumber(id);
    return enrollments.filter((e) => e.phone === tel && (!courseId || e.courseId === courseId));
}

// True when the person (ID number + phone) is actively enrolled in the course.
export async function isStudentEnrolled(courseId, idNumber, phone) {
    return (await findActiveEnrollments({ idNumber, phone, courseId })).length > 0;
}
