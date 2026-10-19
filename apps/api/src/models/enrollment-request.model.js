export const ENROLLMENT_REQUEST_STATUS = Object.freeze({
    PENDING: "pending",
    CONTACTED: "contacted",
    DISCARDED: "discarded"
});

// Identity documents accepted by Ciudad Pastel for course certificates.
export const ID_TYPE = Object.freeze({
    NATIONAL: "national", // Costa Rican cédula: 9 digits, first digit 1-7
    DIMEX: "dimex" // Resident ID: 11 or 12 digits
});

// Statuses that block a new request for the same course and ID number.
// A discarded request does not block, so the person can apply again later.
export const ACTIVE_ENROLLMENT_REQUEST_STATUSES = Object.freeze([
    ENROLLMENT_REQUEST_STATUS.PENDING,
    ENROLLMENT_REQUEST_STATUS.CONTACTED
]);

// Creates a normalized enrollment request object with server-managed defaults.
// A request never creates a confirmed enrollment (that is HU-A09).
export function buildEnrollmentRequest({
    id,
    courseId,
    courseName,
    fullName,
    idType,
    idNumber,
    phone
}) {
    return {
        id,
        courseId,
        courseName,
        fullName,
        idType,
        idNumber,
        phone,
        status: ENROLLMENT_REQUEST_STATUS.PENDING
    };
}

// Public confirmation returned to the visitor: no personal data is echoed back.
export function toEnrollmentRequestConfirmation(enrollmentRequest) {
    return {
        id: enrollmentRequest.id,
        courseId: enrollmentRequest.courseId,
        courseName: enrollmentRequest.courseName,
        status: enrollmentRequest.status,
        createdAt: enrollmentRequest.createdAt,
        message: "Enrollment request received. Ciudad Pastel will contact you to coordinate payment."
    };
}
