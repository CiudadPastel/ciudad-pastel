import {
    createRecipeBook as createRecipeBookService,
    deleteRecipeBook as deleteRecipeBookService,
    getRecipeBookFile as getRecipeBookFileService,
    listRecipeBooksByCourse as listRecipeBooksByCourseService
} from "../services/recipe-book.service.js";

// Handles the HTTP request to upload and link a recipe book to a course.
export async function createRecipeBook(req, res) {
    try {
        const recipeBook = await createRecipeBookService(
            req.params.courseId,
            {
                file: req.file,
                title: req.body?.title
            },
            req.user
        );

        return res.status(201).json(recipeBook);
    } catch (error) {
        if (error.name === "ValidationError") {
            return res.status(400).json({
                message: error.message,
                errors: error.details
            });
        }

        if (error.name === "NotFoundError") {
            return res.status(404).json({
                message: error.message
            });
        }

        if (error.name === "ConflictError") {
            return res.status(409).json({
                message: error.message
            });
        }

        console.error("Recipe book creation error:", error);

        return res.status(500).json({
            message: "Could not create recipe book."
        });
    }
}

// Handles the HTTP request to list all recipe books for a course.
export async function listRecipeBooks(req, res) {
    try {
        const recipeBooks = await listRecipeBooksByCourseService(req.params.courseId);
        return res.status(200).json(recipeBooks);
    } catch (error) {
        if (error.name === "NotFoundError") {
            return res.status(404).json({
                message: error.message
            });
        }

        console.error("Recipe book list error:", error);

        return res.status(500).json({
            message: "Could not retrieve recipe books."
        });
    }
}

// Handles the HTTP request to download a recipe book PDF file.
export async function downloadRecipeBook(req, res) {
    try {
        const { recipeBook, buffer } = await getRecipeBookFileService(
            req.params.courseId,
            req.params.recipeBookId
        );

        const asciiFallback = recipeBook.fileName.replace(/[^\x20-\x7E]/g, "_").replace(/"/g, "");

        res.set({
            "Content-Type": "application/pdf",
            "Content-Length": buffer.length,
            "Content-Disposition": `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(recipeBook.fileName)}`,
            "Cache-Control": "private, no-store"
        });

        return res.status(200).send(buffer);
    } catch (error) {
        if (error.name === "NotFoundError") {
            return res.status(404).json({
                message: error.message
            });
        }

        console.error("Recipe book download error:", error);

        return res.status(500).json({
            message: "Could not download recipe book."
        });
    }
}

// Handles the HTTP request to delete a recipe book and its file.
export async function deleteRecipeBook(req, res) {
    try {
        await deleteRecipeBookService(
            req.params.courseId,
            req.params.recipeBookId
        );

        return res.status(204).send();
    } catch (error) {
        if (error.name === "NotFoundError") {
            return res.status(404).json({
                message: error.message
            });
        }

        console.error("Recipe book deletion error:", error);

        return res.status(500).json({
            message: "Could not delete recipe book."
        });
    }
}
