import { json, Router } from "express";
import { getStudentRecipeBook, handleStudentAccessBodyError, verifyStudent } from "../controllers/student-access.controller.js";
import { studentVerificationRateLimit } from "../middleware/rate-limit.middleware.js";
import { authenticateStudentAccess } from "../middleware/student-access.middleware.js";

const router = Router();
router.post("/verify", studentVerificationRateLimit, json(), verifyStudent);
router.get("/courses/:courseId/recipe-books/:recipeBookId/file", authenticateStudentAccess, getStudentRecipeBook);
router.use(handleStudentAccessBodyError);

export default router;
