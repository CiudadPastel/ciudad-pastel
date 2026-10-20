/*
 * Confirmed enrollment (HU-A09). It is separate from the initial request
 * (HU-A05): an enrollment is registered only by an administrator after the
 * payment was coordinated outside the platform.
 */
export const ENROLLMENT_STATUS = Object.freeze({
    ENROLLED: "enrolled",
    CANCELLED: "cancelled"
});

// Error codes the frontend uses to show a specific message.
export const ENROLLMENT_ERROR_CODE = Object.freeze({
    COURSE_FULL: "COURSE_FULL",
    ALREADY_ENROLLED: "ALREADY_ENROLLED",
    COURSE_ARCHIVED: "COURSE_ARCHIVED",
    REQUEST_ALREADY_CONFIRMED: "REQUEST_ALREADY_CONFIRMED",
    REQUEST_DISCARDED: "REQUEST_DISCARDED"
});

// Creates a new active enrollment with server-managed defaults.
export function buildEnrollment({
    id,
    courseId,
    courseName,
    fullName,
    idType,
    idNumber,
    phone,
    enrollmentRequestId = null,
    note = null
}) {
    return {
        id,
        courseId,
        courseName,
        fullName,
        idType,
        idNumber,
        phone,
        enrollmentRequestId,
        note,
        status: ENROLLMENT_STATUS.ENROLLED
    };
}

/**
 * Remaining spots of a course: capacity minus active enrollments.
 * Null when the course has no capacity defined (no limit).
 */
export function getRemainingSpots(capacity, activeEnrollments) {
    if (capacity === undefined || capacity === null) return null;
    return Math.max(0, capacity - activeEnrollments);
}
