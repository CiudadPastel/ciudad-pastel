import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import { beforeEach, describe, expect, it, vi, afterEach } from "vitest";
import request from "supertest";

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
});
