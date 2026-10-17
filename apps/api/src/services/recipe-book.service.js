import crypto from "node:crypto";

import { buildRecipeBook } from "../models/recipe-book.model.js";
import { getCourseById } from "./course.service.js";
import {
    RECIPE_BOOK_LIMITS,
    validateRecipeBookInput
} from "../validators/recipe-book.validator.js";
import {
    countRecipeBooksByCourseId,
    createRecipeBook as createRecipeBookRepository,
    deleteRecipeBook as deleteRecipeBookRepository,
    getRecipeBookById as getRecipeBookByIdRepository,
    getRecipeBooksByCourseId as getRecipeBooksByCourseIdRepository
} from "../repositories/recipe-book.repository.js";
import {
    deleteRecipeBookFile,
    readRecipeBookFile,
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

// Lists all recipe books associated with a course, newest first.
export async function listRecipeBooksByCourse(courseId) {
    await getCourseById(courseId);
    return getRecipeBooksByCourseIdRepository(courseId);
}

// Retrieves the binary buffer and metadata of a recipe book file for download.
export async function getRecipeBookFile(courseId, recipeBookId) {
    await getCourseById(courseId);

    const recipeBook = await getRecipeBookByIdRepository(recipeBookId);
    if (!recipeBook || recipeBook.courseId !== courseId) {
        const error = new Error("Recipe book not found.");
        error.name = "NotFoundError";
        throw error;
    }

    const buffer = await readRecipeBookFile(recipeBookId);
    if (!buffer) {
        const error = new Error("Recipe book file not found.");
        error.name = "NotFoundError";
        throw error;
    }

    return { recipeBook, buffer };
}

// Deletes a recipe book metadata record and its underlying stored file.
export async function deleteRecipeBook(courseId, recipeBookId) {
    await getCourseById(courseId);

    const recipeBook = await getRecipeBookByIdRepository(recipeBookId);
    if (!recipeBook || recipeBook.courseId !== courseId) {
        const error = new Error("Recipe book not found.");
        error.name = "NotFoundError";
        throw error;
    }

    // Delete metadata first
    await deleteRecipeBookRepository(recipeBookId);

    // Delete binary file chunks; log error if cleanup fails but don't fail the request
    try {
        await deleteRecipeBookFile(recipeBookId);
    } catch (err) {
        console.error("Could not delete recipe book file:", err);
    }
}
