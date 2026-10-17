import { describe, expect, it } from "vitest";

import {
    RECIPE_BOOK_LIMITS,
    sanitizeFileName,
    validateRecipeBookInput
} from "../src/validators/recipe-book.validator.js";

describe("recipe-book.validator", () => {
    function makeFakeFile({
        buffer = Buffer.from("%PDF-1.4 dummy content"),
        mimetype = "application/pdf",
        originalname = "Receta_Queque.pdf"
    } = {}) {
        return {
            buffer,
            size: buffer.length,
            mimetype,
            originalname
        };
    }

    it("accepts a valid PDF file and title", () => {
        const file = makeFakeFile();
        const result = validateRecipeBookInput({ file, title: "Recetario de queques básicos" });

        expect(result.valid).toBe(true);
        expect(result.errors).toEqual([]);
        expect(result.data).toEqual({
            title: "Recetario de queques básicos",
            fileName: "Receta_Queque.pdf",
            sizeBytes: file.buffer.length
        });
    });

    it("defaults title to file name without .pdf when title is omitted or empty", () => {
        const file = makeFakeFile({ originalname: "Panaderia_Artesanal.pdf" });
        const result = validateRecipeBookInput({ file, title: "" });

        expect(result.valid).toBe(true);
        expect(result.data.title).toBe("Panaderia_Artesanal");
        expect(result.data.fileName).toBe("Panaderia_Artesanal.pdf");
    });

    it("rejects when file is missing completely", () => {
        const result = validateRecipeBookInput({});

        expect(result.valid).toBe(false);
        expect(result.errors).toContain("file is required.");
    });

    it("rejects an empty file (0 bytes)", () => {
        const file = makeFakeFile({ buffer: Buffer.alloc(0) });
        const result = validateRecipeBookInput({ file });

        expect(result.valid).toBe(false);
        expect(result.errors).toContain("file must not be empty.");
    });

    it("rejects a file exceeding the maximum size limit", () => {
        const oversized = Buffer.alloc(RECIPE_BOOK_LIMITS.maxBytes + 10);
        oversized.write("%PDF-", 0);

        const file = makeFakeFile({ buffer: oversized });
        const result = validateRecipeBookInput({ file });

        expect(result.valid).toBe(false);
        expect(result.errors).toContain(`file must not exceed ${RECIPE_BOOK_LIMITS.maxBytes} bytes.`);
    });

    it("rejects wrong MIME type even if file has PDF signature", () => {
        const file = makeFakeFile({ mimetype: "image/png" });
        const result = validateRecipeBookInput({ file });

        expect(result.valid).toBe(false);
        expect(result.errors).toContain("file must be a PDF.");
    });

    it("rejects a fake PDF signature even if MIME type is application/pdf", () => {
        const file = makeFakeFile({ buffer: Buffer.from("NOTAPDF-dummy-content") });
        const result = validateRecipeBookInput({ file });

        expect(result.valid).toBe(false);
        expect(result.errors).toContain("file must be a valid PDF document.");
    });

    it("rejects a title shorter than 3 characters", () => {
        const file = makeFakeFile();
        const result = validateRecipeBookInput({ file, title: "ab" });

        expect(result.valid).toBe(false);
        expect(result.errors).toContain(`title must contain at least ${RECIPE_BOOK_LIMITS.title.min} characters.`);
    });

    it("rejects a title longer than 120 characters", () => {
        const file = makeFakeFile();
        const result = validateRecipeBookInput({ file, title: "a".repeat(121) });

        expect(result.valid).toBe(false);
        expect(result.errors).toContain(`title must not exceed ${RECIPE_BOOK_LIMITS.title.max} characters.`);
    });

    it("sanitizes file names containing path traversal and control characters", () => {
        const sanitized = sanitizeFileName("../../../etc/passwd\r\n\t\"test.pdf");
        expect(sanitized).not.toContain("../");
        expect(sanitized).not.toContain("/");
        expect(sanitized).not.toContain("\\");
        expect(sanitized.endsWith(".pdf")).toBe(true);
    });

    it("enforces .pdf extension even if original name lacks extension", () => {
        const sanitized = sanitizeFileName("recetario_sin_extension");
        expect(sanitized).toBe("recetario_sin_extension.pdf");
    });

    it("decodes file names with accents received in latin1 from Multer", () => {
        // "Recetario básico.pdf" encoded in latin1 as Multer does
        const utf8Name = "Recetario básico.pdf";
        const latin1Name = Buffer.from(utf8Name, "utf8").toString("latin1");

        const sanitized = sanitizeFileName(latin1Name);
        expect(sanitized).toBe("Recetario básico.pdf");
    });
});
