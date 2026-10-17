import crypto from "node:crypto";

import { buildRecipeBook } from "../models/recipe-book.model.js";
import { getCourseById } from "./course.service.js";
import {
    RECIPE_BOOK_LIMITS,
    validateRecipeBookInput
} from "../validators/recipe-book.validator.js";
import {
    countRecipeBooksByCourseId,
    createRecipeBook as createRecipeBookRepository
} from "../repositories/recipe-book.repository.js";
import {
    deleteRecipeBookFile,
    saveRecipeBookFile
} from "../storage/recipe-book.storage.js";

// Uploads a PDF file and stores its metadata linked to a course.
export async function createRecipeBook(courseId, { file, title } = {}, user = null) {
    const validation = validateRecipeBookInput({ file, title });

    if (!validation.valid) {
        const error = new Error("Recipe book validation failed.");
        error.name = "ValidationError";
        error.details = validation.errors;
        throw error;
    }

    // Verify course exists (throws NotFoundError if missing)
    await getCourseById(courseId);

    // Enforce per-course recipe book limit
    const currentCount = await countRecipeBooksByCourseId(courseId);
    if (currentCount >= RECIPE_BOOK_LIMITS.maxPerCourse) {
        const error = new Error(
            `Course already has reached the maximum of ${RECIPE_BOOK_LIMITS.maxPerCourse} recipe books.`
        );
        error.name = "ConflictError";
        throw error;
    }

    const id = crypto.randomUUID();

    // Store binary chunks in storage layer
    await saveRecipeBookFile(id, file.buffer);

    try {
        const recipeBook = buildRecipeBook({
            id,
            courseId,
            title: validation.data.title,
            fileName: validation.data.fileName,
            sizeBytes: validation.data.sizeBytes,
            createdBy: user?.uid ?? null
        });

        return await createRecipeBookRepository(recipeBook);
    } catch (error) {
        // Rollback stored binary data if metadata creation fails
        await deleteRecipeBookFile(id).catch(() => {});
        throw error;
    }
}
