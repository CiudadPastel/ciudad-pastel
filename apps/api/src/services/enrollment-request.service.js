import { randomUUID } from "node:crypto";

import { COURSE_STATUS } from "../models/course.model.js";
import {
    ACTIVE_ENROLLMENT_REQUEST_STATUSES,
    ENROLLMENT_REQUEST_STATUS,
    buildEnrollmentRequest,
    toEnrollmentRequestConfirmation
} from "../models/enrollment-request.model.js";
import {
    validateEnrollmentListFilters,
    validateEnrollmentRequestInput,
    validateEnrollmentStatusInput
} from "../validators/enrollment-request.validator.js";
import { ENROLLMENT_ERROR_CODE } from "../models/enrollment.model.js";
import { getCourseById as getCourseByIdRepository } from "../repositories/course.repository.js";
import {
    createEnrollmentRequest as createEnrollmentRequestRepository,
    getEnrollmentRequestById as getEnrollmentRequestByIdRepository,
    getEnrollmentRequests as getEnrollmentRequestsRepository,
    getEnrollmentRequestsForPerson,
    updateEnrollmentRequestStatus as updateEnrollmentRequestStatusRepository
} from "../repositories/enrollment-request.repository.js";

function namedError(name, message, details, code) {
    const error = new Error(message);
    error.name = name;
    if (details) error.details = details;
    if (code) error.code = code;
    return error;
}

/**
 * Registers a visitor's enrollment request for a published course (HU-A05).
 * It is saved as "pending" and never creates a confirmed enrollment.
 */
export async function createEnrollmentRequest(courseId, input) {
    const validation = validateEnrollmentRequestInput(input);

    if (!validation.valid) {
        throw namedError("ValidationError", "Enrollment request validation failed.", validation.errors);
    }

    const course = await getCourseByIdRepository(courseId);

    // Drafts and archived courses are treated as non-existent for visitors.
    if (!course || course.status !== COURSE_STATUS.PUBLISHED) {
        throw namedError("NotFoundError", "Course not found.");
    }

    const { fullName, idType, idNumber, phone } = validation.data;

    // One active request per person and course. A discarded one does not block.
    const previous = await getEnrollmentRequestsForPerson(course.id, idNumber);
    if (previous.some((request) => ACTIVE_ENROLLMENT_REQUEST_STATUSES.includes(request.status))) {
        throw namedError(
            "ConflictError",
            "An enrollment request for this course was already received for this ID number."
        );
    }

    const created = await createEnrollmentRequestRepository(
        buildEnrollmentRequest({
            id: randomUUID(),
            courseId: course.id,
            courseName: course.name,
            fullName,
            idType,
            idNumber,
            phone
        })
    );

    return toEnrollmentRequestConfirmation(created);
}

// Lists requests for the administrator, optionally by course and status.
export async function getEnrollmentRequests(query) {
    const validation = validateEnrollmentListFilters(query);

    if (!validation.valid) {
        throw namedError("ValidationError", "Invalid enrollment request filters.", validation.errors);
    }

    return getEnrollmentRequestsRepository(validation.data);
}

export async function getEnrollmentRequestById(id) {
    const request = await getEnrollmentRequestByIdRepository(id);

    if (!request) {
        throw namedError("NotFoundError", "Enrollment request not found.");
    }

    return request;
}

// Follow-up status: pending, contacted or discarded. Any change between them is allowed.
// A confirmed request (already an enrollment) can no longer be changed here.
export async function updateEnrollmentRequestStatus(id, input) {
    const validation = validateEnrollmentStatusInput(input);

    if (!validation.valid) {
        throw namedError("ValidationError", "Enrollment request status validation failed.", validation.errors);
    }

    const current = await getEnrollmentRequestByIdRepository(id);
    if (!current) {
        throw namedError("NotFoundError", "Enrollment request not found.");
    }
    if (current.status === ENROLLMENT_REQUEST_STATUS.CONFIRMED) {
        throw namedError(
            "ConflictError",
            "This enrollment request was already confirmed as an enrollment.",
            undefined,
            ENROLLMENT_ERROR_CODE.REQUEST_ALREADY_CONFIRMED
        );
    }

    const updated = await updateEnrollmentRequestStatusRepository(id, validation.data.status);

    if (!updated) {
        throw namedError("NotFoundError", "Enrollment request not found.");
    }

    return updated;
}
