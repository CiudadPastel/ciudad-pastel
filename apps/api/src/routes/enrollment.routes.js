import { Router } from "express";

import {
    authenticateUser,
    requireAdmin
} from "../middleware/auth.middleware.js";
import { paymentStatusLookupRateLimit } from "../middleware/rate-limit.middleware.js";

import {
    getCourseEnrollments,
    getEnrollment,
    lookupPaymentStatus,
    registerEnrollment,
    updateEnrollment,
    updatePaymentStatus
} from "../controllers/enrollment.controller.js";

/*
 * Confirmed enrollments (HU-A09). They contain personal data, so every route
 * requires an authenticated administrator (HU-G01).
 */

// Mounted at /api/admin/courses/:courseId/enrollments
export const courseEnrollmentRoutes = Router({ mergeParams: true });

courseEnrollmentRoutes.use(authenticateUser, requireAdmin);
courseEnrollmentRoutes.get("/", getCourseEnrollments);
courseEnrollmentRoutes.post("/", registerEnrollment);

// Mounted at /api/admin/enrollments
export const enrollmentRoutes = Router();

enrollmentRoutes.use(authenticateUser, requireAdmin);
enrollmentRoutes.get("/:id", getEnrollment);
enrollmentRoutes.patch("/:id", updateEnrollment);
enrollmentRoutes.patch("/:id/payment-status", updatePaymentStatus);

// Public student enrollment payment status lookup (HU-A07). Mounted at /api/enrollments.
export const publicEnrollmentRoutes = Router();

publicEnrollmentRoutes.post("/payment-status", paymentStatusLookupRateLimit, lookupPaymentStatus);
