import { randomUUID } from "node:crypto";

import { COURSE_STATUS } from "../models/course.model.js";
import {
    ACTIVE_ENROLLMENT_REQUEST_STATUSES,
    buildEnrollmentRequest,
    toEnrollmentRequestConfirmation
} from "../models/enrollment-request.model.js";
import {
    validateEnrollmentListFilters,
    validateEnrollmentRequestInput,
    validateEnrollmentStatusInput
} from "../validators/enrollment-request.validator.js";
import { getCourseById as getCourseByIdRepository } from "../repositories/course.repository.js";
import {
    createEnrollmentRequest as createEnrollmentRequestRepository,
    getEnrollmentRequestById as getEnrollmentRequestByIdRepository,
    getEnrollmentRequests as getEnrollmentRequestsRepository,
    getEnrollmentRequestsForPerson,
    updateEnrollmentRequestStatus as updateEnrollmentRequestStatusRepository
} from "../repositories/enrollment-request.repository.js";

function namedError(name, message, details) {
    const error = new Error(message);
    error.name = name;
    if (details) error.details = details;
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
export async function updateEnrollmentRequestStatus(id, input) {
    const validation = validateEnrollmentStatusInput(input);

    if (!validation.valid) {
        throw namedError("ValidationError", "Enrollment request status validation failed.", validation.errors);
    }

    const updated = await updateEnrollmentRequestStatusRepository(id, validation.data.status);

    if (!updated) {
        throw namedError("NotFoundError", "Enrollment request not found.");
    }

    return updated;
}
