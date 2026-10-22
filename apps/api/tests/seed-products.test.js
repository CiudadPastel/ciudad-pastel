import { describe, expect, it } from "vitest";

import { buildSeedData } from "../scripts/seed-products.js";
import { PRODUCT_STATUS } from "../src/models/product.model.js";
import {
    validateCategoryInput,
    validateProductInput
} from "../src/validators/product.validator.js";

describe("seed-products", () => {
    const { categories, products } = buildSeedData();

    it("returns exactly 6 sample categories and 18 sample products", () => {
        expect(categories).toHaveLength(6);
        expect(products).toHaveLength(18);
    });

    it("assigns unique and deterministic IDs to all categories and products", () => {
        const categoryIds = categories.map((c) => c.id);
        const productIds = products.map((p) => p.id);

        expect(new Set(categoryIds).size).toBe(6);
        expect(new Set(productIds).size).toBe(18);

        categoryIds.forEach((id) => expect(id).toMatch(/^seed-cat-[1-6]$/));
        productIds.forEach((id) => expect(id).toMatch(/^seed-prod-(0[1-9]|1[0-8])$/));
    });

    it("ensures every product references an existing category ID", () => {
        const validCategoryIds = new Set(categories.map((c) => c.id));

        for (const product of products) {
            expect(validCategoryIds.has(product.categoryId)).toBe(true);
        }
    });

    it("satisfies category validator rules for all 6 categories", () => {
        for (const category of categories) {
            const validation = validateCategoryInput(category);
            expect(validation.valid).toBe(true);
            expect(validation.errors).toHaveLength(0);
        }
    });

    it("satisfies product validator rules for all 18 products", () => {
        for (const product of products) {
            const validation = validateProductInput(product);
            expect(validation.valid).toBe(true);
            expect(validation.errors).toHaveLength(0);
        }
    });

    it("matches exact business criteria counts: 16 published, 13 available, 2 withdrawn, 3 out of stock", () => {
        const publishedProducts = products.filter((p) => p.status === PRODUCT_STATUS.PUBLISHED);
        const withdrawnProducts = products.filter((p) => p.status === PRODUCT_STATUS.WITHDRAWN);
        const availableProducts = products.filter((p) => p.available === true && p.status === PRODUCT_STATUS.PUBLISHED);
        const outOfStockProducts = products.filter((p) => p.available === false && p.status === PRODUCT_STATUS.PUBLISHED);

        expect(publishedProducts).toHaveLength(16);
        expect(withdrawnProducts).toHaveLength(2);
        expect(availableProducts).toHaveLength(13);
        expect(outOfStockProducts).toHaveLength(3);

        // Verify category 6 has 0 published products (all are withdrawn)
        const cat6Published = publishedProducts.filter((p) => p.categoryId === "seed-cat-6");
        expect(cat6Published).toHaveLength(0);
    });

    it("includes required edge-case test fixtures in sample products", () => {
        // Products without images (imageUrl === null)
        const noImageProducts = products.filter((p) => p.imageUrl === null);
        expect(noImageProducts.length).toBeGreaterThanOrEqual(3);

        // Products without description (description === null)
        const noDescProduct = products.find((p) => p.id === "seed-prod-15");
        expect(noDescProduct).toBeDefined();
        expect(noDescProduct.description).toBeNull();
        expect(noDescProduct.imageUrl).toBeNull();
    });
});
