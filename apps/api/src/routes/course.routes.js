import { Router } from "express";

import {
    authenticateUser,
    requireAdmin
} from "../middleware/auth.middleware.js";

import {
    createCourse
} from "../controllers/course.controller.js";

const router = Router();


// Creates a new course for authenticated administrators.
router.post(
    "/",
    authenticateUser,
    requireAdmin,
    createCourse
);

export default router;