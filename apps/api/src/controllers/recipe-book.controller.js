import { createRecipeBook as createRecipeBookService } from "../services/recipe-book.service.js";

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
