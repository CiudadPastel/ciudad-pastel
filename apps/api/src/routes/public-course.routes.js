import { Router } from "express";

import {
    getPublishedCourses,
    getPublishedCourseById
} from "../controllers/course.controller.js";

const router = Router();

router.get("/", getPublishedCourses);
router.get("/:id", getPublishedCourseById);

export default router;
