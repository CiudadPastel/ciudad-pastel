import multer from "multer";

import { RECIPE_BOOK_LIMITS } from "../validators/recipe-book.validator.js";

const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: RECIPE_BOOK_LIMITS.maxBytes,
        files: 1,
        fields: 5
    }
}).single("file");

// Parses one PDF upload and maps multer errors to API responses.
export function uploadRecipeBookFile(req, res, next) {
    upload(req, res, (error) => {
        if (!error) {
            return next();
        }

        if (error.code === "LIMIT_FILE_SIZE") {
            return res.status(413).json({
                message: "File is too large.",
                errors: [`file must not exceed ${RECIPE_BOOK_LIMITS.maxBytes} bytes.`]
            });
        }

        if (error instanceof multer.MulterError) {
            return res.status(400).json({
                message: "Recipe book validation failed.",
                errors: [`file: ${error.message}`]
            });
        }

        console.error("Recipe book upload error:", error);

        return res.status(500).json({
            message: "Could not upload recipe book."
        });
    });
}
