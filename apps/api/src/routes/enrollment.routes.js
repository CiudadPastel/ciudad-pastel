import { Router } from "express";

import {
    authenticateUser,
    requireAdmin
} from "../middleware/auth.middleware.js";

import {
    getCourseEnrollments,
    registerEnrollment,
    updateEnrollment
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
enrollmentRoutes.patch("/:id", updateEnrollment);
