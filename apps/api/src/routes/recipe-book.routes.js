import express from "express";

import {
    authenticateUser,
    requireAdmin
} from "../middleware/auth.middleware.js";
import { uploadRecipeBookFile } from "../middleware/upload.middleware.js";
import { createRecipeBook } from "../controllers/recipe-book.controller.js";

const router = express.Router({ mergeParams: true });

// Course recipe book administration endpoints.
router.post(
    "/",
    authenticateUser,
    requireAdmin,
    uploadRecipeBookFile,
    createRecipeBook
);

export default router;
