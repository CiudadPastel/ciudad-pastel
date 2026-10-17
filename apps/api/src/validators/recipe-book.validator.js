import path from "node:path";

export const RECIPE_BOOK_LIMITS = Object.freeze({
    maxBytes: 20 * 1024 * 1024, // 20 MiB as confirmed for Ciudad Pastel recipe books
    maxPerCourse: 10,
    title: {
        min: 3,
        max: 120
    },
    fileName: {
        max: 150
    }
});

// Fixes Multer's default latin1 encoding of UTF-8 file names when needed.
export function fixUtf8FileName(fileName = "") {
    try {
        const decoded = Buffer.from(fileName, "latin1").toString("utf8");
        // If decoding produced valid characters and didn't result in unprintable garbage, return it
        return decoded;
    } catch {
        return fileName;
    }
}

// Sanitizes a file name: strips directories, control characters, quotes, and enforces .pdf extension.
export function sanitizeFileName(rawName = "") {
    const fixed = fixUtf8FileName(rawName);
    const base = path.basename(fixed).replace(/[\r\n\t"]/g, "_").trim();

    const nameWithoutExt = base.replace(/\.pdf$/i, "").trim() || "recetario";
    const truncated = nameWithoutExt.slice(0, RECIPE_BOOK_LIMITS.fileName.max - 4);

    return `${truncated}.pdf`;
}

// Validates the upload payload of a recipe book (file + optional title).
export function validateRecipeBookInput({ file, title } = {}) {
    const errors = [];

    if (!file || !file.buffer) {
        errors.push("file is required.");
        return {
            valid: false,
            errors,
            data: null
        };
    }

    if (file.size === 0 || file.buffer.length === 0) {
        errors.push("file must not be empty.");
    }

    if (file.size > RECIPE_BOOK_LIMITS.maxBytes || file.buffer.length > RECIPE_BOOK_LIMITS.maxBytes) {
        errors.push(`file must not exceed ${RECIPE_BOOK_LIMITS.maxBytes} bytes.`);
    }

    if (file.mimetype !== "application/pdf") {
        errors.push("file must be a PDF.");
    }

    const hasPdfSignature =
        file.buffer.length >= 5 &&
        file.buffer.subarray(0, 5).equals(Buffer.from("%PDF-"));

    if (file.buffer.length > 0 && !hasPdfSignature) {
        errors.push("file must be a valid PDF document.");
    }

    const cleanFileName = sanitizeFileName(file.originalname || "recetario.pdf");

    let cleanTitle = "";
    if (typeof title === "string" && title.trim().length > 0) {
        cleanTitle = title.trim();
        if (cleanTitle.length < RECIPE_BOOK_LIMITS.title.min) {
            errors.push(`title must contain at least ${RECIPE_BOOK_LIMITS.title.min} characters.`);
        } else if (cleanTitle.length > RECIPE_BOOK_LIMITS.title.max) {
            errors.push(`title must not exceed ${RECIPE_BOOK_LIMITS.title.max} characters.`);
        }
    } else {
        // Default to file name without .pdf extension
        cleanTitle = cleanFileName.replace(/\.pdf$/i, "").trim();
        if (cleanTitle.length < RECIPE_BOOK_LIMITS.title.min) {
            cleanTitle = cleanTitle.padEnd(RECIPE_BOOK_LIMITS.title.min, "_");
        }
    }

    return {
        valid: errors.length === 0,
        errors,
        data: errors.length === 0 ? {
            title: cleanTitle,
            fileName: cleanFileName,
            sizeBytes: file.buffer.length
        } : null
    };
}
