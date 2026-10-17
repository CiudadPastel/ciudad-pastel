import express from "express";

import {
    authenticateUser,
    requireAdmin
} from "../middleware/auth.middleware.js";
import { uploadRecipeBookFile } from "../middleware/upload.middleware.js";
import {
    createRecipeBook,
    deleteRecipeBook,
    downloadRecipeBook,
    listRecipeBooks
} from "../controllers/recipe-book.controller.js";

const router = express.Router({ mergeParams: true });

// Course recipe book administration endpoints.
router.post(
    "/",
    authenticateUser,
    requireAdmin,
    uploadRecipeBookFile,
    createRecipeBook
);

router.get(
    "/",
    authenticateUser,
    requireAdmin,
    listRecipeBooks
);

router.get(
    "/:recipeBookId/file",
    authenticateUser,
    requireAdmin,
    downloadRecipeBook
);

router.delete(
    "/:recipeBookId",
    authenticateUser,
    requireAdmin,
    deleteRecipeBook
);

export default router;
