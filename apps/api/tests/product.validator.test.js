import { describe, expect, it } from "vitest";

import { sanitizeImageUrl } from "../src/validators/image-url.validator.js";
import {
    PRODUCT_LIMITS,
    validateCategoryInput,
    validateProductInput
} from "../src/validators/product.validator.js";

describe("product.validator", () => {
    describe("validateProductInput", () => {
        const validProduct = {
            name: "Harina de trigo 1 kg",
            description: "Harina de trigo refinada especial para repostería.",
            price: 1500,
            categoryId: "cat-123",
            imageUrl: "https://example.com/images/harina.jpg",
            available: true
        };

        it("accepts a completely valid product input", () => {
            const result = validateProductInput(validProduct);

            expect(result.valid).toBe(true);
            expect(result.errors).toEqual([]);
            expect(result.data).toEqual({
                name: "Harina de trigo 1 kg",
                description: "Harina de trigo refinada especial para repostería.",
                price: 1500,
                categoryId: "cat-123",
                imageUrl: "https://example.com/images/harina.jpg",
                available: true
            });
        });

        it("rejects non-object or null root input", () => {
            expect(validateProductInput(null).valid).toBe(false);
            expect(validateProductInput("string").valid).toBe(false);
            expect(validateProductInput([]).valid).toBe(false);
        });

        describe("name validation", () => {
            it("rejects missing or empty name", () => {
                const result = validateProductInput({ ...validProduct, name: "" });
                expect(result.valid).toBe(false);
                expect(result.errors).toContain("name is required.");
            });

            it("rejects name with fewer than 3 characters", () => {
                const result = validateProductInput({ ...validProduct, name: "Ab" });
                expect(result.valid).toBe(false);
                expect(result.errors).toContain(
                    `name must contain at least ${PRODUCT_LIMITS.product.name.min} characters.`
                );
            });

            it("rejects name exceeding 120 characters", () => {
                const longName = "A".repeat(121);
                const result = validateProductInput({ ...validProduct, name: longName });
                expect(result.valid).toBe(false);
                expect(result.errors).toContain(
                    `name must not exceed ${PRODUCT_LIMITS.product.name.max} characters.`
                );
            });
        });

        describe("price validation", () => {
            it("rejects price of 0", () => {
                const result = validateProductInput({ ...validProduct, price: 0 });
                expect(result.valid).toBe(false);
                expect(result.errors[0]).toMatch(/price must be an integer between 1 and 10000000/);
            });

            it("rejects decimal price", () => {
                const result = validateProductInput({ ...validProduct, price: 1500.5 });
                expect(result.valid).toBe(false);
                expect(result.errors[0]).toMatch(/price must be an integer between 1 and 10000000/);
            });

            it("rejects text price string", () => {
                const result = validateProductInput({ ...validProduct, price: "1500" });
                expect(result.valid).toBe(false);
                expect(result.errors[0]).toMatch(/price must be an integer between 1 and 10000000/);
            });

            it("rejects negative price", () => {
                const result = validateProductInput({ ...validProduct, price: -500 });
                expect(result.valid).toBe(false);
                expect(result.errors[0]).toMatch(/price must be an integer between 1 and 10000000/);
            });

            it("rejects price exceeding maximum of 10,000,000", () => {
                const result = validateProductInput({ ...validProduct, price: 10_000_001 });
                expect(result.valid).toBe(false);
                expect(result.errors[0]).toMatch(/price must be an integer between 1 and 10000000/);
            });

            it("accepts edge boundary prices (1 and 10,000,000)", () => {
                expect(validateProductInput({ ...validProduct, price: 1 }).valid).toBe(true);
                expect(validateProductInput({ ...validProduct, price: 10_000_000 }).valid).toBe(true);
            });
        });

        describe("description validation", () => {
            it("accepts null or omitted description and sanitizes to null", () => {
                const resultWithoutDesc = validateProductInput({
                    ...validProduct,
                    description: undefined
                });
                expect(resultWithoutDesc.valid).toBe(true);
                expect(resultWithoutDesc.data.description).toBeNull();

                const resultNullDesc = validateProductInput({
                    ...validProduct,
                    description: null
                });
                expect(resultNullDesc.valid).toBe(true);
                expect(resultNullDesc.data.description).toBeNull();
            });

            it("rejects description exceeding 1000 characters", () => {
                const longDesc = "D".repeat(1001);
                const result = validateProductInput({ ...validProduct, description: longDesc });
                expect(result.valid).toBe(false);
                expect(result.errors).toContain(
                    `description must not exceed ${PRODUCT_LIMITS.product.description.max} characters.`
                );
            });

            it("rejects non-string description", () => {
                const result = validateProductInput({ ...validProduct, description: 12345 });
                expect(result.valid).toBe(false);
                expect(result.errors).toContain("description must be a text string.");
            });
        });

        describe("categoryId validation", () => {
            it("rejects missing, null or whitespace categoryId", () => {
                expect(validateProductInput({ ...validProduct, categoryId: "" }).valid).toBe(false);
                expect(validateProductInput({ ...validProduct, categoryId: null }).valid).toBe(false);
                expect(validateProductInput({ ...validProduct, categoryId: "   " }).valid).toBe(false);
            });
        });

        describe("imageUrl validation", () => {
            it("rejects non-http/https protocols such as javascript: or ftp:", () => {
                const jsResult = validateProductInput({
                    ...validProduct,
                    imageUrl: "javascript:alert(1)"
                });
                expect(jsResult.valid).toBe(false);
                expect(jsResult.errors).toContain("imageUrl must be a valid http or https URL.");

                const ftpResult = validateProductInput({
                    ...validProduct,
                    imageUrl: "ftp://example.com/pic.jpg"
                });
                expect(ftpResult.valid).toBe(false);
                expect(ftpResult.errors).toContain("imageUrl must be a valid http or https URL.");
            });

            it("rejects URL exceeding 500 characters", () => {
                const longUrl = "https://example.com/" + "a".repeat(490);
                const result = validateProductInput({ ...validProduct, imageUrl: longUrl });
                expect(result.valid).toBe(false);
                expect(result.errors).toContain("imageUrl must not exceed 500 characters.");
            });

            it("accepts null, undefined or empty string and sanitizes to null", () => {
                const nullResult = validateProductInput({ ...validProduct, imageUrl: null });
                expect(nullResult.valid).toBe(true);
                expect(nullResult.data.imageUrl).toBeNull();

                const emptyResult = validateProductInput({ ...validProduct, imageUrl: "   " });
                expect(emptyResult.valid).toBe(true);
                expect(emptyResult.data.imageUrl).toBeNull();
            });
        });

        describe("security and internal fields stripping", () => {
            it("ignores client-supplied status, id, createdAt and updatedAt fields", () => {
                const maliciousInput = {
                    ...validProduct,
                    id: "hacked-id",
                    status: "withdrawn",
                    createdAt: "2020-01-01T00:00:00.000Z",
                    updatedAt: "2020-01-01T00:00:00.000Z"
                };

                const result = validateProductInput(maliciousInput);

                expect(result.valid).toBe(true);
                expect(result.data.id).toBeUndefined();
                expect(result.data.status).toBeUndefined();
                expect(result.data.createdAt).toBeUndefined();
                expect(result.data.updatedAt).toBeUndefined();
            });
        });
    });

    describe("validateCategoryInput", () => {
        const validCategory = {
            name: "Harinas y mezclas",
            order: 1
        };

        it("accepts a valid category input", () => {
            const result = validateCategoryInput(validCategory);

            expect(result.valid).toBe(true);
            expect(result.errors).toEqual([]);
            expect(result.data).toEqual({
                name: "Harinas y mezclas",
                order: 1
            });
        });

        it("rejects non-object or null root input", () => {
            expect(validateCategoryInput(null).valid).toBe(false);
            expect(validateCategoryInput("category").valid).toBe(false);
        });

        it("rejects category name shorter than 2 characters", () => {
            const result = validateCategoryInput({ ...validCategory, name: "A" });
            expect(result.valid).toBe(false);
            expect(result.errors).toContain(
                `name must contain at least ${PRODUCT_LIMITS.category.name.min} characters.`
            );
        });

        it("rejects category name longer than 60 characters", () => {
            const longName = "C".repeat(61);
            const result = validateCategoryInput({ ...validCategory, name: longName });
            expect(result.valid).toBe(false);
            expect(result.errors).toContain(
                `name must not exceed ${PRODUCT_LIMITS.category.name.max} characters.`
            );
        });

        it("rejects negative order", () => {
            const result = validateCategoryInput({ ...validCategory, order: -1 });
            expect(result.valid).toBe(false);
            expect(result.errors).toContain("order must be a non-negative integer.");
        });

        it("defaults order to 0 when omitted", () => {
            const result = validateCategoryInput({ name: "Decoración" });
            expect(result.valid).toBe(true);
            expect(result.data.order).toBe(0);
        });
    });

    describe("sanitizeImageUrl", () => {
        it("returns valid https URL", () => {
            expect(sanitizeImageUrl("https://example.com/photo.jpg")).toBe("https://example.com/photo.jpg");
        });

        it("returns valid http URL", () => {
            expect(sanitizeImageUrl("http://example.com/photo.jpg")).toBe("http://example.com/photo.jpg");
        });

        it("returns null for javascript:alert(1) scheme", () => {
            expect(sanitizeImageUrl("javascript:alert(1)")).toBeNull();
        });

        it("returns null for data: base64 URI scheme", () => {
            expect(sanitizeImageUrl("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=")).toBeNull();
        });

        it("returns null for unformatted plain text", () => {
            expect(sanitizeImageUrl("not-a-valid-url")).toBeNull();
        });

        it("returns null for empty or whitespace-only string", () => {
            expect(sanitizeImageUrl("")).toBeNull();
            expect(sanitizeImageUrl("    ")).toBeNull();
        });

        it("returns null for null and undefined", () => {
            expect(sanitizeImageUrl(null)).toBeNull();
            expect(sanitizeImageUrl(undefined)).toBeNull();
        });

        it("returns null for URLs exceeding 500 characters", () => {
            const longUrl = "https://example.com/" + "x".repeat(500);
            expect(sanitizeImageUrl(longUrl)).toBeNull();
        });
    });
});

