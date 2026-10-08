import { Router } from "express";

import {
    authenticateUser,
    requireAdmin
} from "../middleware/auth.middleware.js";

import {
    createCourse,
    getCourses,
    getCourseById,
    updateCourse,
    updateCourseStatus
} from "../controllers/course.controller.js";

const router = Router();

router.patch(
    "/:id/status",
    authenticateUser,
    requireAdmin,
    updateCourseStatus
);

router.get(
    "/",
    authenticateUser,
    requireAdmin,
    getCourses
);

router.get(
    "/:id",
    authenticateUser,
    requireAdmin,
    getCourseById
);


router.put(
    "/:id",
    authenticateUser,
    requireAdmin,
    updateCourse
);

// Creates a new course for authenticated administrators.
router.post(
    "/",
    authenticateUser,
    requireAdmin,
    createCourse
);

export default router;
