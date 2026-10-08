import { Router } from "express";

import { getPublishedCourses } from "../controllers/course.controller.js";

const router = Router();

router.get("/", getPublishedCourses);

export default router;
