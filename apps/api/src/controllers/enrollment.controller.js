import {
    confirmEnrollmentRequest as confirmEnrollmentRequestService,
    getCourseEnrollments as getCourseEnrollmentsService,
    getEnrollment as getEnrollmentService,
    registerEnrollment as registerEnrollmentService,
    updateEnrollment as updateEnrollmentService,
    updatePaymentStatus as updatePaymentStatusService
} from "../services/enrollment.service.js";

// Translates known service errors into HTTP responses. 409 includes a code
// (COURSE_FULL, ALREADY_ENROLLED, ...) so the frontend can show a clear message.
function sendKnownError(res, error) {
    if (error.name === "ValidationError") {
        return res.status(400).json({ message: error.message, errors: error.details });
    }

    if (error.name === "NotFoundError") {
        return res.status(404).json({ message: error.message });
    }

    if (error.name === "ConflictError") {
        return res.status(409).json({ message: error.message, code: error.code });
    }

    return null;
}

function handle(service, { status = 200, errorMessage, getArgs }) {
    return async (req, res) => {
        try {
            const result = await service(...getArgs(req));
            return res.status(status).json(result);
        } catch (error) {
            if (sendKnownError(res, error)) return;

            console.error(`${errorMessage}:`, error);
            return res.status(500).json({ message: `${errorMessage}.` });
        }
    };
}

// POST /api/admin/courses/:courseId/enrollments
export const registerEnrollment = handle(registerEnrollmentService, {
    status: 201,
    errorMessage: "Could not register enrollment",
    getArgs: (req) => [req.params.courseId, req.body]
});

// POST /api/admin/enrollment-requests/:id/confirm
export const confirmEnrollmentRequest = handle(confirmEnrollmentRequestService, {
    status: 201,
    errorMessage: "Could not confirm enrollment request",
    getArgs: (req) => [req.params.id, req.body]
});

// GET /api/admin/courses/:courseId/enrollments
export const getCourseEnrollments = handle(getCourseEnrollmentsService, {
    errorMessage: "Could not retrieve enrollments",
    getArgs: (req) => [req.params.courseId, req.query]
});

// GET /api/admin/enrollments/:id
export const getEnrollment = handle(getEnrollmentService, {
    errorMessage: "Could not retrieve enrollment",
    getArgs: (req) => [req.params.id]
});

// PATCH /api/admin/enrollments/:id
export const updateEnrollment = handle(updateEnrollmentService, {
    errorMessage: "Could not update enrollment",
    getArgs: (req) => [req.params.id, req.body]
});

// PATCH /api/admin/enrollments/:id/payment-status
export const updatePaymentStatus = handle(updatePaymentStatusService, {
    errorMessage: "Could not update payment status",
    getArgs: (req) => [req.params.id, req.body?.paymentStatus, req.user]
});
