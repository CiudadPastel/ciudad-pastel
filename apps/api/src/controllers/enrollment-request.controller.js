import {
    createEnrollmentRequest as createEnrollmentRequestService,
    getEnrollmentRequestById as getEnrollmentRequestByIdService,
    getEnrollmentRequests as getEnrollmentRequestsService,
    updateEnrollmentRequestStatus as updateEnrollmentRequestStatusService
} from "../services/enrollment-request.service.js";

// Translates known service errors into HTTP responses.
function sendKnownError(res, error) {
    if (error.name === "ValidationError") {
        return res.status(400).json({ message: error.message, errors: error.details });
    }

    if (error.name === "NotFoundError") {
        return res.status(404).json({ message: error.message });
    }

    if (error.name === "ConflictError") {
        return res.status(409).json({ message: error.message });
    }

    return null;
}

// Public: a visitor submits an enrollment request for a published course.
export async function createEnrollmentRequest(req, res) {
    try {
        const confirmation = await createEnrollmentRequestService(req.params.id, req.body);

        return res.status(201).json(confirmation);
    } catch (error) {
        if (sendKnownError(res, error)) return;

        console.error("Enrollment request creation error:", error);

        return res.status(500).json({ message: "Could not submit enrollment request." });
    }
}

// Admin: lists enrollment requests (?courseId=&status=).
export async function getEnrollmentRequests(req, res) {
    try {
        const requests = await getEnrollmentRequestsService(req.query);

        return res.status(200).json(requests);
    } catch (error) {
        if (sendKnownError(res, error)) return;

        console.error("Enrollment request list error:", error);

        return res.status(500).json({ message: "Could not retrieve enrollment requests." });
    }
}

// Admin: one request's details.
export async function getEnrollmentRequestById(req, res) {
    try {
        const request = await getEnrollmentRequestByIdService(req.params.id);

        return res.status(200).json(request);
    } catch (error) {
        if (sendKnownError(res, error)) return;

        console.error("Enrollment request detail error:", error);

        return res.status(500).json({ message: "Could not retrieve enrollment request." });
    }
}

// Admin: changes the follow-up status (pending, contacted, discarded).
export async function updateEnrollmentRequestStatus(req, res) {
    try {
        const request = await updateEnrollmentRequestStatusService(req.params.id, req.body);

        return res.status(200).json(request);
    } catch (error) {
        if (sendKnownError(res, error)) return;

        console.error("Enrollment request status error:", error);

        return res.status(500).json({ message: "Could not update enrollment request status." });
    }
}
