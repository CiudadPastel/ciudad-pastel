import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import { beforeEach, describe, expect, it, vi, afterEach } from "vitest";
import request from "supertest";
import express from "express";

import { buildSeedData } from "../scripts/seed-products.js";

const fake = vi.hoisted(() => {
    let productsList = [];
    let categoriesList = [];

    return {
        getProductsList: () => productsList,
        setProductsList: (list) => {
            productsList = list;
        },
        getCategoriesList: () => categoriesList,
        setCategoriesList: (list) => {
            categoriesList = list;
        },
        verifyIdToken: vi.fn(),
        productRepository: {
            getPublishedProducts: vi.fn(() => Promise.resolve(productsList.filter((p) => p.status === "published"))),
            upsertProduct: vi.fn()
        },
        categoryRepository: {
            getCategories: vi.fn(() => Promise.resolve([...categoriesList])),
            upsertCategory: vi.fn()
        }
    };
});

// Avoid loading credentials or touching real Firebase
vi.mock("dotenv", () => ({ default: { config: vi.fn() } }));
vi.mock("firebase-admin/app", () => {
    throw new Error("Real Firebase app access is forbidden.");
});
vi.mock("../src/config/firebase.js", () => ({
    auth: { verifyIdToken: fake.verifyIdToken },
    db: { collection: vi.fn() }
}));
vi.mock("../src/repositories/product.repository.js", () => fake.productRepository);
vi.mock("../src/repositories/category.repository.js", () => fake.categoryRepository);

import app from "../src/app.js";
import { invalidateProductCatalogCache } from "../src/services/product.service.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const openApiPath = path.join(__dirname, "../docs/openapi.yaml");

describe("public-product.api", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        invalidateProductCatalogCache();
        fake.setProductsList([]);
        fake.setCategoriesList([]);
        fake.productRepository.getPublishedProducts.mockImplementation(() =>
            Promise.resolve(fake.getProductsList().filter((p) => p.status === "published"))
        );
        fake.categoryRepository.getCategories.mockImplementation(() =>
            Promise.resolve([...fake.getCategoriesList()])
        );
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("returns 200 with an empty list envelope when no products are present", async () => {
        const response = await request(app).get("/api/products");

        expect(response.status).toBe(200);
        expect(response.body).toEqual({
            items: [],
            products: [],
            total: 0,
            page: 1,
            limit: 12,
            hasMore: false
        });
    });

    it("returns only published products, ignoring withdrawn ones", async () => {
        fake.setCategoriesList([{ id: "cat-1", name: "Harinas", order: 1 }]);
        fake.setProductsList([
            {
                id: "prod-1",
                name: "Harina todo uso",
                description: "1 kg",
                price: 1500,
                categoryId: "cat-1",
                imageUrl: "https://example.com/p1.jpg",
                available: true,
                status: "published"
            },
            {
                id: "prod-2",
                name: "Harina retirada",
                description: "Retirada de catálogo",
                price: 2000,
                categoryId: "cat-1",
                imageUrl: null,
                available: true,
                status: "withdrawn"
            }
        ]);

        const response = await request(app).get("/api/products");

        expect(response.status).toBe(200);
        expect(response.body.items).toHaveLength(1);
        expect(response.body.total).toBe(1);
        expect(response.body.items[0].id).toBe("prod-1");
        expect(response.body.items[0].name).toBe("Harina todo uso");
    });

    it("includes out of stock products with available: false", async () => {
        fake.setCategoriesList([{ id: "cat-1", name: "Chocolates", order: 1 }]);
        fake.setProductsList([
            {
                id: "prod-out",
                name: "Cacao puro en polvo",
                description: "Agotado temporalmente",
                price: 4300,
                categoryId: "cat-1",
                imageUrl: null,
                available: false,
                status: "published"
            }
        ]);

        const response = await request(app).get("/api/products");

        expect(response.status).toBe(200);
        expect(response.body.items).toHaveLength(1);
        expect(response.body.items[0].available).toBe(false);
    });

    it("exposes exact public keys and does not leak internal metadata fields", async () => {
        fake.setCategoriesList([{ id: "cat-1", name: "Harinas", order: 1 }]);
        fake.setProductsList([
            {
                id: "prod-keys",
                name: "Harina especial",
                description: "Descripción",
                price: 1800,
                categoryId: "cat-1",
                imageUrl: "https://example.com/harina.jpg",
                available: true,
                status: "published",
                createdAt: "2026-01-01T00:00:00.000Z",
                updatedAt: "2026-01-01T00:00:00.000Z"
            }
        ]);

        const response = await request(app).get("/api/products");

        expect(response.status).toBe(200);
        const item = response.body.items[0];
        const expectedKeys = ["available", "category", "description", "id", "imageUrl", "name", "price"].sort();
        expect(Object.keys(item).sort()).toEqual(expectedKeys);

        expect(item).not.toHaveProperty("status");
        expect(item).not.toHaveProperty("categoryId");
        expect(item).not.toHaveProperty("createdAt");
        expect(item).not.toHaveProperty("updatedAt");
    });

    it("joins products with their categories and sets category: null when not found", async () => {
        fake.setCategoriesList([{ id: "cat-1", name: "Harinas y mezclas", order: 1 }]);
        fake.setProductsList([
            {
                id: "prod-with-cat",
                name: "Harina 1 kg",
                price: 1500,
                categoryId: "cat-1",
                available: true,
                status: "published"
            },
            {
                id: "prod-orphan",
                name: "Producto sin categoría existente",
                price: 2500,
                categoryId: "cat-non-existent",
                available: true,
                status: "published"
            }
        ]);

        const response = await request(app).get("/api/products");

        expect(response.status).toBe(200);
        const withCat = response.body.items.find((p) => p.id === "prod-with-cat");
        const orphan = response.body.items.find((p) => p.id === "prod-orphan");

        expect(withCat.category).toEqual({
            id: "cat-1",
            name: "Harinas y mezclas"
        });
        expect(orphan.category).toBeNull();
    });

    it("orders products primarily by category order asc (null category at the end) and secondarily by name in Spanish", async () => {
        fake.setCategoriesList([
            { id: "cat-2", name: "Chocolates", order: 2 },
            { id: "cat-1", name: "Harinas", order: 1 }
        ]);

        fake.setProductsList([
            { id: "p-choc-b", name: "Chocolate con leche", price: 2000, categoryId: "cat-2", status: "published" },
            { id: "p-choc-a", name: "Álbum de chocolate", price: 3000, categoryId: "cat-2", status: "published" },
            { id: "p-harina-z", name: "Zumo para mezclas", price: 1000, categoryId: "cat-1", status: "published" },
            { id: "p-harina-a", name: "Azúcar glass", price: 1200, categoryId: "cat-1", status: "published" },
            { id: "p-orphan-b", name: "Barra sin categoría", price: 900, categoryId: "none", status: "published" },
            { id: "p-orphan-a", name: "Ápice sin categoría", price: 800, categoryId: "none", status: "published" }
        ]);

        const response = await request(app).get("/api/products");

        expect(response.status).toBe(200);
        const ids = response.body.items.map((p) => p.id);

        expect(ids).toEqual([
            "p-harina-a",
            "p-harina-z",
            "p-choc-a",
            "p-choc-b",
            "p-orphan-a",
            "p-orphan-b"
        ]);
    });

    it("functions without an Authorization token and never calls verifyIdToken", async () => {
        fake.setProductsList([]);

        const response = await request(app).get("/api/products");

        expect(response.status).toBe(200);
        expect(fake.verifyIdToken).not.toHaveBeenCalled();
    });

    it("caches catalog in memory for 60 seconds and re-queries after expiration", async () => {
        vi.useFakeTimers();

        fake.setCategoriesList([{ id: "cat-1", name: "Harinas", order: 1 }]);
        fake.setProductsList([
            { id: "p1", name: "Harina 1 kg", price: 1500, categoryId: "cat-1", status: "published" }
        ]);

        // First request loads and caches
        const res1 = await request(app).get("/api/products");
        expect(res1.status).toBe(200);
        expect(fake.productRepository.getPublishedProducts).toHaveBeenCalledTimes(1);
        expect(fake.categoryRepository.getCategories).toHaveBeenCalledTimes(1);

        // Advance 30 seconds (still within 60s TTL)
        vi.advanceTimersByTime(30_000);

        const res2 = await request(app).get("/api/products");
        expect(res2.status).toBe(200);
        // Did not re-query
        expect(fake.productRepository.getPublishedProducts).toHaveBeenCalledTimes(1);
        expect(fake.categoryRepository.getCategories).toHaveBeenCalledTimes(1);

        // Advance past 60s TTL (another 31s = 61s total)
        vi.advanceTimersByTime(31_000);

        const res3 = await request(app).get("/api/products");
        expect(res3.status).toBe(200);
        // Re-queried
        expect(fake.productRepository.getPublishedProducts).toHaveBeenCalledTimes(2);
        expect(fake.categoryRepository.getCategories).toHaveBeenCalledTimes(2);
    });

    it("forces immediate cache refresh when invalidateProductCatalogCache is called", async () => {
        vi.useFakeTimers();

        fake.setCategoriesList([{ id: "cat-1", name: "Harinas", order: 1 }]);
        fake.setProductsList([
            { id: "p1", name: "Harina 1 kg", price: 1500, categoryId: "cat-1", status: "published" }
        ]);

        await request(app).get("/api/products");
        expect(fake.productRepository.getPublishedProducts).toHaveBeenCalledTimes(1);

        // Advance only 10 seconds
        vi.advanceTimersByTime(10_000);

        // Explicitly invalidate cache
        invalidateProductCatalogCache();

        await request(app).get("/api/products");
        expect(fake.productRepository.getPublishedProducts).toHaveBeenCalledTimes(2);
    });

    it("returns clean 500 when repository throws and does not cache the failure", async () => {
        const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

        fake.productRepository.getPublishedProducts.mockRejectedValueOnce(
            new Error("Firestore cluster unavailable")
        );

        const errorResponse = await request(app).get("/api/products");

        expect(errorResponse.status).toBe(500);
        expect(errorResponse.body).toEqual({
            message: "Could not load the product catalog."
        });
        expect(consoleErrorSpy).toHaveBeenCalled();

        // Ensure failure was NOT cached: subsequent call recovers
        fake.productRepository.getPublishedProducts.mockResolvedValueOnce([]);
        const recoveredResponse = await request(app).get("/api/products");

        expect(recoveredResponse.status).toBe(200);
        expect(recoveredResponse.body.items).toEqual([]);

        consoleErrorSpy.mockRestore();
    });

    describe("image handling in public endpoint (CIU-133)", () => {
        it("sanitizes unsafe stored imageUrl (such as javascript:alert(1)) to null", async () => {
            fake.setCategoriesList([{ id: "cat-1", name: "Insumos", order: 1 }]);
            fake.setProductsList([
                {
                    id: "prod-xss",
                    name: "Insumo con url maliciosa",
                    price: 2000,
                    categoryId: "cat-1",
                    imageUrl: "javascript:alert(1)",
                    available: true,
                    status: "published"
                }
            ]);

            const response = await request(app).get("/api/products");

            expect(response.status).toBe(200);
            expect(response.body.items).toHaveLength(1);
            expect(response.body.items[0].imageUrl).toBeNull();
        });

        it("always returns imageUrl: null and never undefined for products without an image", async () => {
            fake.setCategoriesList([{ id: "cat-1", name: "Insumos", order: 1 }]);
            fake.setProductsList([
                {
                    id: "prod-no-img",
                    name: "Insumo sin foto",
                    price: 2500,
                    categoryId: "cat-1",
                    imageUrl: null,
                    available: true,
                    status: "published"
                },
                {
                    id: "prod-undefined-img",
                    name: "Insumo con imagen undefined",
                    price: 3000,
                    categoryId: "cat-1",
                    imageUrl: undefined,
                    available: true,
                    status: "published"
                }
            ]);

            const response = await request(app).get("/api/products");

            expect(response.status).toBe(200);
            expect(response.body.items).toHaveLength(2);

            for (const item of response.body.items) {
                expect(item).toHaveProperty("imageUrl");
                expect(item.imageUrl).toBeNull();
                expect(item.imageUrl).not.toBeUndefined();
            }
        });
    });

    describe("Pagination and Limit validation (CIU-132 / CIU-127)", () => {
        const createProducts = (count) =>
            Array.from({ length: count }, (_, i) => ({
                id: `prod-${String(i + 1).padStart(2, "0")}`,
                name: `Producto ${String(i + 1).padStart(2, "0")}`,
                price: 1000 + i,
                categoryId: "cat-1",
                available: true,
                status: "published"
            }));

        beforeEach(() => {
            fake.setCategoriesList([{ id: "cat-1", name: "General", order: 1 }]);
        });

        it("defaults to page 1 and limit 12 when no query params are passed", async () => {
            fake.setProductsList(createProducts(18));

            const response = await request(app).get("/api/products");

            expect(response.status).toBe(200);
            expect(response.body.page).toBe(1);
            expect(response.body.limit).toBe(12);
            expect(response.body.total).toBe(18);
            expect(response.body.items).toHaveLength(12);
            expect(response.body.products).toHaveLength(12);
            expect(response.body.hasMore).toBe(true);
        });

        it("serves the second page with hasMore: false when reaching the end", async () => {
            fake.setProductsList(createProducts(18));

            const response = await request(app).get("/api/products?page=2&limit=12");

            expect(response.status).toBe(200);
            expect(response.body.page).toBe(2);
            expect(response.body.limit).toBe(12);
            expect(response.body.total).toBe(18);
            expect(response.body.items).toHaveLength(6);
            expect(response.body.hasMore).toBe(false);
            expect(response.body.items[0].id).toBe("prod-13");
            expect(response.body.items[5].id).toBe("prod-18");
        });

        it("clamps limit to 50 when a higher limit is requested", async () => {
            fake.setProductsList(createProducts(60));

            const response = await request(app).get("/api/products?limit=999");

            expect(response.status).toBe(200);
            expect(response.body.limit).toBe(50);
            expect(response.body.items).toHaveLength(50);
            expect(response.body.hasMore).toBe(true);
        });

        it("recovers gracefully from invalid or negative query params, falling back to defaults", async () => {
            fake.setProductsList(createProducts(15));

            const response = await request(app).get("/api/products?page=-3&limit=cero");

            expect(response.status).toBe(200);
            expect(response.body.page).toBe(1);
            expect(response.body.limit).toBe(12);
            expect(response.body.items).toHaveLength(12);
            expect(response.body.hasMore).toBe(true);
        });

        it("returns empty items and hasMore: false when requesting beyond total pages", async () => {
            fake.setProductsList(createProducts(5));

            const response = await request(app).get("/api/products?page=10&limit=12");

            expect(response.status).toBe(200);
            expect(response.body.page).toBe(10);
            expect(response.body.items).toEqual([]);
            expect(response.body.products).toEqual([]);
            expect(response.body.hasMore).toBe(false);
            expect(response.body.total).toBe(5);
        });
    });

    describe("Backend Acceptance Criteria [CIU-136]", () => {
        it("returns 12 products on page 1 with hasMore: true from seed data, and no empty categories", async () => {
            const { categories, products } = buildSeedData();
            fake.setCategoriesList(categories);
            fake.setProductsList(products);

            // Default pagination gives page 1, limit 12
            const response = await request(app).get("/api/products");

            expect(response.status).toBe(200);
            expect(response.body.total).toBe(16);
            expect(response.body.page).toBe(1);
            expect(response.body.limit).toBe(12);
            expect(response.body.hasMore).toBe(true);
            expect(response.body.items).toHaveLength(12);

            // Fetching all 16 by passing limit=20
            const fullRes = await request(app).get("/api/products?limit=20");
            expect(fullRes.status).toBe(200);
            expect(fullRes.body.items).toHaveLength(16);
            expect(fullRes.body.hasMore).toBe(false);

            const availableCount = fullRes.body.items.filter((p) => p.available === true).length;
            const outOfStockCount = fullRes.body.items.filter((p) => p.available === false).length;
            expect(availableCount).toBe(13);
            expect(outOfStockCount).toBe(3);

            // Category 6 has 0 published products, so no product in response has categoryId 'seed-cat-6'
            const cat6Products = fullRes.body.items.filter((p) => p.category?.id === "seed-cat-6");
            expect(cat6Products).toHaveLength(0);
        });

        it("rejects public mutation methods (POST, PUT, PATCH, DELETE) with 404", async () => {
            const postRes = await request(app).post("/api/products").send({ name: "Intruso" });
            expect(postRes.status).toBe(404);

            const putRes = await request(app).put("/api/products/seed-prod-01").send({ price: 100 });
            expect(putRes.status).toBe(404);

            const patchRes = await request(app).patch("/api/products/seed-prod-01").send({ available: false });
            expect(patchRes.status).toBe(404);

            const deleteRes = await request(app).delete("/api/products/seed-prod-01");
            expect(deleteRes.status).toBe(404);
        });

        it("never leaks internal document fields (status, categoryId, createdAt, updatedAt) in any response", async () => {
            const { categories, products } = buildSeedData();
            fake.setCategoriesList(categories);
            fake.setProductsList(
                products.map((p) => ({
                    ...p,
                    createdAt: "2026-01-01T00:00:00.000Z",
                    updatedAt: "2026-01-01T00:00:00.000Z"
                }))
            );

            const response = await request(app).get("/api/products?limit=50");

            expect(response.status).toBe(200);
            expect(response.body.items.length).toBeGreaterThan(0);

            for (const product of response.body.items) {
                expect(product).not.toHaveProperty("status");
                expect(product).not.toHaveProperty("categoryId");
                expect(product).not.toHaveProperty("createdAt");
                expect(product).not.toHaveProperty("updatedAt");
            }
        });

        it("conforms strictly to the OpenAPI PublicProductListResponse and PublicProduct schema specification", async () => {
            const openApiContent = fs.readFileSync(openApiPath, "utf8");
            const spec = YAML.parse(openApiContent);
            const listResponseSchema = spec.components?.schemas?.PublicProductListResponse;
            const publicProductSchema = spec.components?.schemas?.PublicProduct;

            expect(listResponseSchema).toBeDefined();
            expect(publicProductSchema).toBeDefined();

            expect(listResponseSchema.required).toEqual(
                expect.arrayContaining(["items", "hasMore", "total", "page", "limit"])
            );

            const expectedProductRequired = publicProductSchema.required;
            expect(expectedProductRequired).toEqual(
                expect.arrayContaining(["id", "name", "description", "price", "imageUrl", "available", "category"])
            );

            const { categories, products } = buildSeedData();
            fake.setCategoriesList(categories);
            fake.setProductsList(products);

            const response = await request(app).get("/api/products?limit=20");
            expect(response.status).toBe(200);

            expect(typeof response.body.total).toBe("number");
            expect(typeof response.body.page).toBe("number");
            expect(typeof response.body.limit).toBe("number");
            expect(typeof response.body.hasMore).toBe("boolean");
            expect(Array.isArray(response.body.items)).toBe(true);

            for (const item of response.body.items) {
                for (const key of expectedProductRequired) {
                    expect(item).toHaveProperty(key);
                }

                expect(typeof item.id).toBe("string");
                expect(typeof item.name).toBe("string");
                expect(item.description === null || typeof item.description === "string").toBe(true);
                expect(typeof item.price).toBe("number");
                expect(Number.isInteger(item.price)).toBe(true);
                expect(item.imageUrl === null || typeof item.imageUrl === "string").toBe(true);
                expect(typeof item.available).toBe("boolean");

                if (item.category !== null) {
                    expect(typeof item.category).toBe("object");
                    expect(typeof item.category.id).toBe("string");
                    expect(typeof item.category.name).toBe("string");
                }
            }
        });

        it("handles and correctly paginates a catalog of 500 products across multiple categories with stable order", async () => {
            const mockCategories = Array.from({ length: 10 }, (_, i) => ({
                id: `cat-${i + 1}`,
                name: `Categoría ${i + 1}`,
                order: i + 1
            }));

            const mockProducts = [];
            for (let i = 1; i <= 500; i++) {
                const catIndex = ((i - 1) % 10) + 1;
                const padded = String(i).padStart(3, "0");
                mockProducts.push({
                    id: `prod-large-${i}`,
                    name: `Producto ${padded}`,
                    price: 1000 + i,
                    categoryId: `cat-${catIndex}`,
                    available: true,
                    status: "published"
                });
            }

            fake.setCategoriesList(mockCategories);
            fake.setProductsList(mockProducts);

            // Fetch page 1 (50 items max)
            const resPage1 = await request(app).get("/api/products?page=1&limit=50");
            expect(resPage1.status).toBe(200);
            expect(resPage1.body.total).toBe(500);
            expect(resPage1.body.items).toHaveLength(50);
            expect(resPage1.body.hasMore).toBe(true);

            // Fetch page 2 (50 items)
            const resPage2 = await request(app).get("/api/products?page=2&limit=50");
            expect(resPage2.status).toBe(200);
            expect(resPage2.body.items).toHaveLength(50);
            expect(resPage2.body.hasMore).toBe(true);

            // Ensure no overlap between page 1 and page 2
            const page1Ids = new Set(resPage1.body.items.map((p) => p.id));
            for (const item of resPage2.body.items) {
                expect(page1Ids.has(item.id)).toBe(false);
            }

            // Verify order consistency across all 50 items on page 1
            for (let i = 0; i < resPage1.body.items.length - 1; i++) {
                const current = resPage1.body.items[i];
                const next = resPage1.body.items[i + 1];

                const currentCat = mockCategories.find((c) => c.id === current.category.id);
                const nextCat = mockCategories.find((c) => c.id === next.category.id);

                if (currentCat.order === nextCat.order) {
                    expect(current.name.localeCompare(next.name, "es")).toBeLessThanOrEqual(0);
                } else {
                    expect(currentCat.order).toBeLessThan(nextCat.order);
                }
            }
        });

        it("returns clean 500 when category repository fails while product repository is healthy", async () => {
            const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

            fake.categoryRepository.getCategories.mockRejectedValueOnce(
                new Error("Firestore connection timed out for categories")
            );
            fake.setProductsList([
                { id: "p1", name: "Harina", categoryId: "c1", price: 1000, status: "published" }
            ]);

            const response = await request(app).get("/api/products");

            expect(response.status).toBe(500);
            expect(response.body).toEqual({
                message: "Could not load the product catalog."
            });
            expect(consoleErrorSpy).toHaveBeenCalled();

            consoleErrorSpy.mockRestore();
        });

        it("keeps catalog fully functional with category: null when all categories are missing", async () => {
            fake.setCategoriesList([]);
            fake.setProductsList([
                { id: "p2", name: "Zumo de naranja", price: 1200, categoryId: "missing-1", status: "published" },
                { id: "p1", name: "Azúcar pulverizada", price: 900, categoryId: "missing-2", status: "published" }
            ]);

            const response = await request(app).get("/api/products");

            expect(response.status).toBe(200);
            expect(response.body.items).toHaveLength(2);
            expect(response.body.total).toBe(2);

            expect(response.body.items[0].name).toBe("Azúcar pulverizada");
            expect(response.body.items[0].category).toBeNull();

            expect(response.body.items[1].name).toBe("Zumo de naranja");
            expect(response.body.items[1].category).toBeNull();
        });
    });

    describe("HU-T04 category filter (CIU-143, CIU-144, CIU-149)", () => {
        const product = (id, categoryId, extra = {}) => ({
            id, name: id, categoryId, price: 1500, available: true,
            status: "published", ...extra
        });
        const emptyEnvelope = (page = 1, limit = 12) => ({
            items: [], products: [], total: 0, page, limit, hasMore: false
        });

        beforeEach(() => {
            fake.setCategoriesList([
                { id: "b", name: "Chocolates", order: 2, createdAt: "private" },
                { id: "a", name: "Decoración", order: 1 },
                { id: "tie-z", name: "Zanahoria", order: 2 },
                { id: "tie-a", name: "Ázucar", order: 2 },
                { id: "withdrawn", name: "Retirados", order: 0 },
                { id: "empty", name: "Vacía", order: 0 }
            ]);
            // Match the existing repository contract; actual repository ordering is tested separately.
            fake.categoryRepository.getCategories.mockImplementation(() => Promise.resolve(
                [...fake.getCategoriesList()].sort((a, b) => a.order - b.order || a.name.localeCompare(b.name, "es"))
            ));
            fake.setProductsList([
                product("a-1", "a", { imageUrl: "javascript:alert(1)", createdAt: "private" }),
                product("a-2", "a", { available: false }),
                product("a-hidden", "a", { status: "withdrawn" }),
                product("b-1", "b"),
                product("tie-z-1", "tie-z"), product("tie-a-1", "tie-a"),
                product("hidden", "withdrawn", { status: "withdrawn" }),
                product("orphan", "missing")
            ]);
        });

        it("lists only existing categories with published products, publicly and with exact safe keys", async () => {
            const response = await request(app).get("/api/categories");
            expect(response.status).toBe(200);
            expect(fake.verifyIdToken).not.toHaveBeenCalled();
            expect(response.body).toEqual([
                { id: "a", name: "Decoración" },
                { id: "tie-a", name: "Ázucar" },
                { id: "b", name: "Chocolates" },
                { id: "tie-z", name: "Zanahoria" }
            ]);
        });

        it("includes categories whose only published product is out of stock", async () => {
            fake.setProductsList([product("out", "b", { available: false })]);
            const response = await request(app).get("/api/categories");
            expect(response.status).toBe(200);
            expect(response.body).toEqual([{ id: "b", name: "Chocolates" }]);
        });

        it.each([{ products: [] }, { products: [product("hidden", "a", { status: "withdrawn" })] }, { products: [product("orphan", "missing")] }])(
            "returns an empty category array when no existing category qualifies (%j)", async ({ products }) => {
                fake.setProductsList(products);
                const response = await request(app).get("/api/categories");
                expect(response.status).toBe(200);
                expect(response.body).toEqual([]);
            }
        );

        it("preserves the unfiltered response and filters by stored id, including out-of-stock products", async () => {
            const all = await request(app).get("/api/products");
            const filtered = await request(app).get("/api/products?categoryId=a");
            expect(all.status).toBe(200);
            expect(all.body.total).toBe(6);
            expect(filtered.status).toBe(200);
            expect(filtered.body).toEqual({
                ...all.body,
                items: all.body.items.filter((p) => p.category?.id === "a"),
                products: all.body.products.filter((p) => p.category?.id === "a"), total: 2
            });
            expect(filtered.body.items.map((p) => p.id)).toEqual(["a-1", "a-2"]);
            expect(filtered.body.items[1].available).toBe(false);
            expect(filtered.body.items[0].imageUrl).toBeNull();
            expect(Object.keys(filtered.body.items[0]).sort()).toEqual(
                ["id", "name", "description", "price", "imageUrl", "available", "category"].sort()
            );
        });

        it.each(["unknown", "missing", "empty", "withdrawn", "Decoración", " a "])(
            "returns a normalized empty envelope for category %s", async (categoryId) => {
                const response = await request(app).get("/api/products").query({ categoryId, page: -1, limit: "invalid" });
                expect(response.status).toBe(200);
                expect(response.body).toEqual(emptyEnvelope());
            }
        );

        it("preserves requested page and clamped limit for unknown categories", async () => {
            const response = await request(app).get("/api/products?categoryId=unknown&page=3&limit=999");
            expect(response.status).toBe(200);
            expect(response.body).toEqual(emptyEnvelope(3, 50));
        });

        it.each(["categoryId=", "categoryId=%20%20", "categoryId=a&categoryId=b", "categoryId[]=a", "categoryId[id]=a"])(
            "rejects malformed input without broadening the catalog: %s", async (query) => {
                const response = await request(app).get("/api/products?" + query);
                expect(response.status).toBe(400);
                expect(response.body).toEqual({ message: "categoryId must be a non-empty string." });
                expect(fake.productRepository.getPublishedProducts).not.toHaveBeenCalled();
            }
        );

        it("handles object-valued categoryId under an extended query parser", async () => {
            const original = app.get("query parser");
            app.set("query parser", "extended");
            try {
                const response = await request(app).get("/api/products?categoryId[id]=a");
                expect(response.status).toBe(400);
                expect(response.body).toEqual({ message: "categoryId must be a non-empty string." });
            } finally {
                app.set("query parser", original);
            }
        });

        it("filters before pagination with filtered totals, stable name/id ordering and subsequent pages", async () => {
            const products = Array.from({ length: 15 }, (_, i) => product("a-" + String(i).padStart(2, "0"), "a"));
            fake.setProductsList([
                ...Array.from({ length: 10 }, (_, i) => product("b-" + i, "b")),
                ...products.slice().reverse(),
                ...Array.from({ length: 4 }, (_, i) => product("hidden-" + i, "a", { status: "withdrawn" }))
            ]);
            const first = await request(app).get("/api/products?categoryId=a&limit=10");
            const second = await request(app).get("/api/products?categoryId=a&page=2&limit=10");
            const third = await request(app).get("/api/products?categoryId=a&page=3&limit=10");
            expect(first.body).toMatchObject({ total: 15, page: 1, limit: 10, hasMore: true });
            expect(first.body.items.map((p) => p.id)).toEqual(products.slice(0, 10).map((p) => p.id));
            expect(second.body).toMatchObject({ total: 15, page: 2, limit: 10, hasMore: false });
            expect(second.body.items.map((p) => p.id)).toEqual(products.slice(10).map((p) => p.id));
            expect(third.body).toEqual({ ...emptyEnvelope(3, 10), total: 15 });
        });

        it("breaks equal product-name ties by id within a filtered category", async () => {
            fake.setProductsList([product("z", "a", { name: "Igual" }), product("a", "a", { name: "Igual" })]);
            const response = await request(app).get("/api/products?categoryId=a");
            expect(response.body.items.map((p) => p.id)).toEqual(["a", "z"]);
        });

        it("keeps defaults and the maximum limit for filtered requests", async () => {
            fake.setProductsList(Array.from({ length: 60 }, (_, i) => product("p" + i, "a")));
            const defaults = await request(app).get("/api/products?categoryId=a");
            const max = await request(app).get("/api/products?categoryId=a&limit=999");
            expect(defaults.body).toMatchObject({ total: 60, page: 1, limit: 12, hasMore: true });
            expect(defaults.body.items).toHaveLength(12);
            expect(max.body.limit).toBe(50);
            expect(max.body.items).toHaveLength(50);
            expect(max.body.hasMore).toBe(true);
        });

        it.each(["/api/products", "/api/categories"])("shares one snapshot when first loaded through %s", async (firstPath) => {
            await request(app).get(firstPath);
            await request(app).get("/api/products");
            await request(app).get("/api/products?categoryId=a");
            await request(app).get("/api/products?categoryId=b");
            await request(app).get("/api/categories");
            expect(fake.productRepository.getPublishedProducts).toHaveBeenCalledTimes(1);
            expect(fake.categoryRepository.getCategories).toHaveBeenCalledTimes(1);
        });

        it("refreshes both endpoints at the exact TTL boundary", async () => {
            vi.useFakeTimers({ toFake: ["Date"] });
            vi.setSystemTime(new Date("2026-10-29T00:00:00Z"));
            await request(app).get("/api/categories");
            fake.setProductsList([product("new", "empty")]);
            vi.setSystemTime(new Date("2026-10-29T00:00:59.999Z"));
            expect((await request(app).get("/api/products?categoryId=a")).body.total).toBe(2);
            vi.setSystemTime(new Date("2026-10-29T00:01:00Z"));
            expect((await request(app).get("/api/categories")).body).toEqual([{ id: "empty", name: "Vacía" }]);
            expect((await request(app).get("/api/products?categoryId=empty")).body.total).toBe(1);
            expect(fake.productRepository.getPublishedProducts).toHaveBeenCalledTimes(2);
            expect(fake.categoryRepository.getCategories).toHaveBeenCalledTimes(2);
        });

        // Observe both real HTTP requests entering the app before releasing the repository.
        function concurrentRequests(paths) {
            const observedApp = express();
            const entered = Promise.withResolvers();
            let count = 0;
            observedApp.use((req, res, next) => {
                next();
                if (++count === paths.length) entered.resolve();
            });
            observedApp.use(app);
            return {
                entered: entered.promise,
                responses: Promise.all(paths.map((path) => request(observedApp).get(path).then((res) => res)))
            };
        }

        it.each(["empty", "expired"])("coalesces concurrent HTTP requests with an %s cache", async (state) => {
            vi.useFakeTimers({ toFake: ["Date"] });
            if (state === "expired") {
                await request(app).get("/api/products");
                vi.setSystemTime(Date.now() + 60_000);
            }
            fake.productRepository.getPublishedProducts.mockClear();
            fake.categoryRepository.getCategories.mockClear();
            const gate = Promise.withResolvers();
            const published = fake.getProductsList().filter((p) => p.status === "published");
            fake.productRepository.getPublishedProducts.mockReturnValue(gate.promise);
            const requests = concurrentRequests(["/api/products?categoryId=a", "/api/categories"]);
            try {
                await requests.entered;
                expect(fake.productRepository.getPublishedProducts).toHaveBeenCalledTimes(1);
                expect(fake.categoryRepository.getCategories).toHaveBeenCalledTimes(1);
            } finally {
                gate.resolve(published);
                await requests.responses;
            }
            const [products, categories] = await requests.responses;
            expect(products.status).toBe(200);
            expect(products.body.total).toBe(2);
            expect(categories.status).toBe(200);
            expect(categories.body).toHaveLength(4);
        });

        it("does not let an older in-flight load repopulate the cache after invalidation", async () => {
            const gate = Promise.withResolvers();
            fake.productRepository.getPublishedProducts.mockReturnValueOnce(gate.promise);
            const oldRequest = concurrentRequests(["/api/products?categoryId=a"]);
            await oldRequest.entered;
            invalidateProductCatalogCache();
            fake.setProductsList([product("new", "empty")]);
            try {
                const refreshed = await request(app).get("/api/categories");
                expect(refreshed.status).toBe(200);
                expect(refreshed.body).toEqual([{ id: "empty", name: "Vacía" }]);
            } finally {
                gate.resolve([product("old", "a")]);
                await oldRequest.responses;
            }
            expect((await request(app).get("/api/categories")).body).toEqual([{ id: "empty", name: "Vacía" }]);
            expect((await request(app).get("/api/products?categoryId=empty")).body.items.map((p) => p.id)).toEqual(["new"]);
            expect(fake.productRepository.getPublishedProducts).toHaveBeenCalledTimes(2);
        });

        it("retries after a shared in-flight failure without poisoning either endpoint", async () => {
            const spy = vi.spyOn(console, "error").mockImplementation(() => {});
            const gate = Promise.withResolvers();
            fake.productRepository.getPublishedProducts.mockReturnValueOnce(gate.promise);
            const requests = concurrentRequests(["/api/products?categoryId=a", "/api/categories"]);
            try {
                await requests.entered;
            } finally {
                gate.reject(new Error("private repository failure"));
            }
            try {
                const [products, categories] = await requests.responses;
                expect(products.status).toBe(500);
                expect(categories.status).toBe(500);
                expect(products.body).toEqual({ message: "Could not load the product catalog." });
                expect(categories.body).toEqual({ message: "Could not load the product categories." });
                expect((await request(app).get("/api/products?categoryId=a")).body.total).toBe(2);
                expect((await request(app).get("/api/categories")).body).toHaveLength(4);
                expect(fake.productRepository.getPublishedProducts).toHaveBeenCalledTimes(2);
            } finally { spy.mockRestore(); }
        });

        it("distinguishes stored category IDs with identical display names and paginates a later category", async () => {
            fake.setCategoriesList([
                { id: "a", name: "Igual", order: 1 },
                { id: "b", name: "Igual", order: 2 }
            ]);
            fake.setProductsList([
                ...Array.from({ length: 15 }, (_, i) => product("a-" + String(i).padStart(2, "0"), "a")),
                ...Array.from({ length: 10 }, (_, i) => product("b-" + String(i).padStart(2, "0"), "b"))
            ]);
            const response = await request(app).get("/api/products?categoryId=b&page=2&limit=3");
            expect(response.status).toBe(200);
            expect(response.body).toMatchObject({ total: 10, page: 2, limit: 3, hasMore: true });
            expect(response.body.items.map((p) => p.id)).toEqual(["b-03", "b-04", "b-05"]);
            expect(response.body.items.every((p) => p.category.id === "b")).toBe(true);
        });

        it("invalidation removes the last withdrawn category and adds the first published category", async () => {
            fake.setProductsList([product("old", "a")]);
            await request(app).get("/api/products");
            fake.setProductsList([product("old", "a", { status: "withdrawn" }), product("new", "empty", { available: false })]);
            expect((await request(app).get("/api/categories")).body).toEqual([{ id: "a", name: "Decoración" }]);
            invalidateProductCatalogCache();
            expect((await request(app).get("/api/categories")).body).toEqual([{ id: "empty", name: "Vacía" }]);
            expect((await request(app).get("/api/products?categoryId=a")).body).toEqual(emptyEnvelope());
            expect((await request(app).get("/api/products?categoryId=empty")).body.total).toBe(1);
            expect(fake.productRepository.getPublishedProducts).toHaveBeenCalledTimes(2);
        });

        it.each(["productRepository", "categoryRepository"])("does not cache %s failures or expose exception details", async (repository) => {
            const spy = vi.spyOn(console, "error").mockImplementation(() => {});
            try {
                const method = repository === "productRepository" ? "getPublishedProducts" : "getCategories";
                fake[repository][method].mockRejectedValueOnce(new Error("secret Firestore path and credentials"));
                const response = await request(app).get("/api/categories");
                expect(response.status).toBe(500);
                expect(response.body).toEqual({ message: "Could not load the product categories." });
                expect((await request(app).get("/api/products?categoryId=a")).status).toBe(200);
                expect((await request(app).get("/api/categories")).body).toHaveLength(4);
                expect(fake[repository][method]).toHaveBeenCalledTimes(2);
            } finally { spy.mockRestore(); }
        });

        it("response mutations cannot corrupt subsequent products or categories", async () => {
            const response = await request(app).get("/api/products?categoryId=a");
            response.body.items[0].name = "corrupt";
            response.body.items[0].category.name = "corrupt";
            const categories = await request(app).get("/api/categories");
            categories.body[0].name = "corrupt";
            expect((await request(app).get("/api/products?categoryId=a")).body.items[0].name).toBe("a-1");
            expect((await request(app).get("/api/categories")).body[0].name).toBe("Decoración");
        });

        it("preserves safe catalog errors for filtered requests and recovers without caching failures", async () => {
            const spy = vi.spyOn(console, "error").mockImplementation(() => {});
            try {
                fake.productRepository.getPublishedProducts.mockRejectedValueOnce(new Error("private Firestore details"));
                const response = await request(app).get("/api/products?categoryId=a");
                expect(response.status).toBe(500);
                expect(response.body).toEqual({ message: "Could not load the product catalog." });
                const recovered = await request(app).get("/api/products?categoryId=a");
                expect(recovered.status).toBe(200);
                expect(recovered.body.total).toBe(2);
                expect(fake.productRepository.getPublishedProducts).toHaveBeenCalledTimes(2);
            } finally { spy.mockRestore(); }
        });

        it("returns detached service data, including nested categories", async () => {
            const { getPublicCatalog, getPublicCategories } = await import("../src/services/product.service.js");
            const catalog = await getPublicCatalog({ categoryId: "a" });
            catalog.items[0].category.name = "corrupt";
            catalog.items.splice(0);
            const categories = await getPublicCategories();
            categories[0].name = "corrupt";
            expect((await getPublicCatalog({ categoryId: "a" })).items[0].category.name).toBe("Decoración");
            expect((await getPublicCategories())[0].name).toBe("Decoración");
        });

        it("initializes the app and answers health without real Firebase or authentication", async () => {
            const response = await request(app).get("/api/health");
            expect(response.status).toBe(200);
            expect(response.body).toEqual({ status: "ok", message: "Ciudad Pastel API is running" });
            expect(fake.verifyIdToken).not.toHaveBeenCalled();
            expect(fake.productRepository.getPublishedProducts).not.toHaveBeenCalled();
        });

        it("parses valid OpenAPI YAML documenting the public category/filter contracts", () => {
            const doc = YAML.parseDocument(fs.readFileSync(openApiPath, "utf8"));
            expect(doc.errors).toEqual([]);
            const spec = doc.toJS();
            const categories = spec.paths["/categories"].get;
            expect(categories.security).toEqual([]);
            expect(categories.responses["200"].content["application/json"].schema).toEqual({
                type: "array", items: { $ref: "#/components/schemas/PublicCategory" }
            });
            expect(categories.responses["500"]).toBeDefined();
            expect(spec.components.schemas.PublicCategory).toMatchObject({
                type: "object", required: ["id", "name"], additionalProperties: false
            });
            expect(Object.keys(spec.components.schemas.PublicCategory.properties).sort()).toEqual(["id", "name"]);
            const products = spec.paths["/products"].get;
            expect(products.security).toEqual([]);
            expect(products.parameters.find((p) => p.name === "categoryId")).toMatchObject({
                in: "query", required: false, schema: { type: "string", minLength: 1 }
            });
            expect(products.responses["400"]).toBeDefined();
            expect(spec.components.schemas.PublicProductListResponse.required).toContain("products");
        });
    });

});
