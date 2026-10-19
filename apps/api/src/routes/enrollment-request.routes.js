import { Router } from "express";

import {
    authenticateUser,
    requireAdmin
} from "../middleware/auth.middleware.js";

import {
    getEnrollmentRequests,
    getEnrollmentRequestById,
    updateEnrollmentRequestStatus
} from "../controllers/enrollment-request.controller.js";
import { confirmEnrollmentRequest } from "../controllers/enrollment.controller.js";

// Administrative enrollment requests. They contain personal data, so every
// route requires an authenticated administrator (HU-G01).
const router = Router();

router.use(authenticateUser, requireAdmin);

router.get("/", getEnrollmentRequests);
router.get("/:id", getEnrollmentRequestById);
router.patch("/:id/status", updateEnrollmentRequestStatus);

// HU-A09: turns the request into a confirmed enrollment
router.post("/:id/confirm", confirmEnrollmentRequest);

export default router;
