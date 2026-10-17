export const ENROLLMENT_REQUEST_STATUS = Object.freeze({
    PENDING: "pending",
    CONTACTED: "contacted",
    CANCELLED: "cancelled"
});

// Creates a normalized enrollment request object with server-managed defaults.
export function buildEnrollmentRequest({
    id,
    courseId,
    courseName,
    fullName,
    email,
    phone,
    message = null
}) {
    return {
        id,
        courseId,
        courseName,
        fullName,
        email,
        phone,
        message: message ?? null,
        status: ENROLLMENT_REQUEST_STATUS.PENDING
    };
}
