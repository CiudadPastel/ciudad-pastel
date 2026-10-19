import { Router } from "express";

import {
    getPublishedCourses,
    getPublishedCourseById
} from "../controllers/course.controller.js";
import { createEnrollmentRequest } from "../controllers/enrollment-request.controller.js";
import { enrollmentRequestRateLimit } from "../middleware/rate-limit.middleware.js";

const router = Router();

router.get("/", getPublishedCourses);
router.get("/:id", getPublishedCourseById);

// Public enrollment request (HU-A05): no account needed, limited by IP against spam.
router.post("/:id/enrollment-requests", enrollmentRequestRateLimit, createEnrollmentRequest);

export default router;
