import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import { beforeEach, describe, expect, it, vi, afterEach } from "vitest";
import request from "supertest";

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
            getAllProducts: vi.fn(() => Promise.resolve([...productsList])),
            getProductById: vi.fn((id) => Promise.resolve(productsList.find((p) => p.id === id) || null)),
            getPublishedProducts: vi.fn(() => Promise.resolve(productsList.filter((p) => p.status === "published"))),
            upsertProduct: vi.fn()
        },
        categoryRepository: {
            getCategories: vi.fn(() => Promise.resolve([...categoriesList])),
            getCategoryById: vi.fn((id) => Promise.resolve(categoriesList.find((c) => c.id === id) || null)),
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

const ADMIN_AUTH_HEADER = { Authorization: "Bearer valid-admin-token" };
const USER_AUTH_HEADER = { Authorization: "Bearer regular-user-token" };

describe("Admin Products and Categories API (HU-T06 / CIU-6)", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        fake.setProductsList([]);
        fake.setCategoriesList([]);
        invalidateProductCatalogCache();
        fake.productRepository.getPublishedProducts.mockImplementation(() =>
            Promise.resolve(fake.getProductsList().filter((p) => p.status === "published"))
        );

        fake.verifyIdToken.mockImplementation(async (token) => {
            if (token === "valid-admin-token") {
                return { uid: "admin-user", admin: true };
            }
            if (token === "regular-user-token") {
                return { uid: "regular-user", admin: false };
            }
            throw new Error("Decoding Firebase ID token failed");
        });

        fake.productRepository.getAllProducts.mockImplementation(() =>
            Promise.resolve([...fake.getProductsList()])
        );
        fake.productRepository.getProductById.mockImplementation((id) =>
            Promise.resolve(fake.getProductsList().find((p) => p.id === id) || null)
        );
        fake.productRepository.upsertProduct.mockImplementation((product) => {
            const now = new Date().toISOString();
            const list = fake.getProductsList();
            const existingIndex = list.findIndex((p) => p.id === product.id);
            const saved = {
                ...product,
                createdAt: existingIndex >= 0 ? list[existingIndex].createdAt : now,
                updatedAt: now
            };
            if (existingIndex >= 0) {
                list[existingIndex] = saved;
            } else {
                list.push(saved);
            }
            return Promise.resolve(saved);
        });

        fake.categoryRepository.getCategories.mockImplementation(() =>
            Promise.resolve([...fake.getCategoriesList()])
        );
        fake.categoryRepository.getCategoryById.mockImplementation((id) =>
            Promise.resolve(fake.getCategoriesList().find((c) => c.id === id) || null)
        );
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    describe("GET /api/admin/products", () => {
        it("requires authentication (returns 401 without token)", async () => {
            const res = await request(app).get("/api/admin/products");

            expect(res.status).toBe(401);
            expect(res.body).toEqual({ message: "Authentication required" });
            expect(fake.productRepository.getAllProducts).not.toHaveBeenCalled();
        });

        it("rejects invalid or expired token with 401", async () => {
            const res = await request(app)
                .get("/api/admin/products")
                .set("Authorization", "Bearer invalid-token");

            expect(res.status).toBe(401);
            expect(res.body).toEqual({ message: "Invalid or expired authentication token" });
            expect(fake.productRepository.getAllProducts).not.toHaveBeenCalled();
        });

        it("requires administrator privileges (returns 403 for non-admin)", async () => {
            const res = await request(app)
                .get("/api/admin/products")
                .set(USER_AUTH_HEADER);

            expect(res.status).toBe(403);
            expect(res.body).toEqual({ message: "Administrator privileges required" });
            expect(fake.productRepository.getAllProducts).not.toHaveBeenCalled();
        });

        it("returns an empty array when there are no products in the catalog", async () => {
            const res = await request(app)
                .get("/api/admin/products")
                .set(ADMIN_AUTH_HEADER);

            expect(res.status).toBe(200);
            expect(res.body).toEqual([]);
        });

        it("returns all products including published and withdrawn statuses", async () => {
            fake.setCategoriesList([
                { id: "cat-1", name: "Pasteles", order: 1 }
            ]);
            fake.setProductsList([
                {
                    id: "prod-pub",
                    name: "Pastel de Chocolate",
                    description: "Delicioso pastel",
                    price: 15000,
                    categoryId: "cat-1",
                    imageUrl: "https://example.com/choco.jpg",
                    available: true,
                    status: "published",
                    createdAt: "2026-01-01T10:00:00.000Z",
                    updatedAt: "2026-01-01T10:00:00.000Z"
                },
                {
                    id: "prod-withdrawn",
                    name: "Pastel de Vainilla Antiguo",
                    description: "Retirado de venta",
                    price: 12000,
                    categoryId: "cat-1",
                    imageUrl: null,
                    available: false,
                    status: "withdrawn",
                    createdAt: "2026-01-02T10:00:00.000Z",
                    updatedAt: "2026-01-02T10:00:00.000Z"
                }
            ]);

            const res = await request(app)
                .get("/api/admin/products")
                .set(ADMIN_AUTH_HEADER);

            expect(res.status).toBe(200);
            expect(res.body).toHaveLength(2);

            const statuses = res.body.map((p) => p.status);
            expect(statuses).toContain("published");
            expect(statuses).toContain("withdrawn");
        });

        it("has exact keys in AdminProduct matching the design contract", async () => {
            fake.setCategoriesList([
                { id: "cat-1", name: "Pasteles", order: 1 }
            ]);
            fake.setProductsList([
                {
                    id: "prod-1",
                    name: "Pastel Tres Leches",
                    description: "Con merengue",
                    price: 18000,
                    categoryId: "cat-1",
                    imageUrl: "https://example.com/tresleches.jpg",
                    available: true,
                    status: "published",
                    createdAt: "2026-01-01T10:00:00.000Z",
                    updatedAt: "2026-01-01T10:00:00.000Z",
                    brand: "Marca interna secreta", // internal/extra fields must not leak
                    weight: "1 kg",
                    size: "24 cm"
                }
            ]);

            const res = await request(app)
                .get("/api/admin/products")
                .set(ADMIN_AUTH_HEADER);

            expect(res.status).toBe(200);
            const product = res.body[0];
            const expectedKeys = [
                "id",
                "name",
                "description",
                "price",
                "imageUrl",
                "available",
                "status",
                "category",
                "createdAt",
                "updatedAt"
            ].sort();

            expect(Object.keys(product).sort()).toEqual(expectedKeys);
            expect(product.id).toBe("prod-1");
            expect(product.category).toEqual({ id: "cat-1", name: "Pasteles" });
            expect(product.brand).toBeUndefined();
            expect(product.weight).toBeUndefined();
            expect(product.size).toBeUndefined();
            expect(product.categoryId).toBeUndefined();
        });

        it("resolves category to null when categoryId is nonexistent", async () => {
            fake.setCategoriesList([]);
            fake.setProductsList([
                {
                    id: "prod-orphan",
                    name: "Producto sin categoria",
                    description: null,
                    price: 5000,
                    categoryId: "cat-deleted",
                    imageUrl: null,
                    available: true,
                    status: "published",
                    createdAt: "2026-01-01T10:00:00.000Z",
                    updatedAt: "2026-01-01T10:00:00.000Z"
                }
            ]);

            const res = await request(app)
                .get("/api/admin/products")
                .set(ADMIN_AUTH_HEADER);

            expect(res.status).toBe(200);
            expect(res.body[0].category).toBeNull();
        });

        it("orders products by updatedAt descending (most recently updated first)", async () => {
            fake.setCategoriesList([]);
            fake.setProductsList([
                {
                    id: "older",
                    name: "Producto Antiguo",
                    description: null,
                    price: 1000,
                    categoryId: null,
                    imageUrl: null,
                    available: true,
                    status: "published",
                    createdAt: "2026-01-01T10:00:00.000Z",
                    updatedAt: "2026-01-01T10:00:00.000Z"
                },
                {
                    id: "newest",
                    name: "Producto Reciente",
                    description: null,
                    price: 2000,
                    categoryId: null,
                    imageUrl: null,
                    available: true,
                    status: "published",
                    createdAt: "2026-01-01T10:00:00.000Z",
                    updatedAt: "2026-01-10T15:00:00.000Z"
                },
                {
                    id: "middle",
                    name: "Producto Intermedio",
                    description: null,
                    price: 1500,
                    categoryId: null,
                    imageUrl: null,
                    available: true,
                    status: "published",
                    createdAt: "2026-01-01T10:00:00.000Z",
                    updatedAt: "2026-01-05T12:00:00.000Z"
                }
            ]);

            const res = await request(app)
                .get("/api/admin/products")
                .set(ADMIN_AUTH_HEADER);

            expect(res.status).toBe(200);
            const ids = res.body.map((p) => p.id);
            expect(ids).toEqual(["newest", "middle", "older"]);
        });

        it("returns clean 500 without leaking internals when repository fails", async () => {
            fake.productRepository.getAllProducts.mockRejectedValueOnce(
                new Error("Firestore cluster unavailable on socket 9821")
            );

            const res = await request(app)
                .get("/api/admin/products")
                .set(ADMIN_AUTH_HEADER);

            expect(res.status).toBe(500);
            expect(res.body).toEqual({ message: "Could not retrieve products." });
            expect(res.body.stack).toBeUndefined();
            expect(JSON.stringify(res.body)).not.toContain("Firestore cluster");
        });
    });

    describe("GET /api/admin/products/:id", () => {
        it("requires authentication (returns 401 without token)", async () => {
            const res = await request(app).get("/api/admin/products/prod-1");

            expect(res.status).toBe(401);
            expect(res.body).toEqual({ message: "Authentication required" });
            expect(fake.productRepository.getProductById).not.toHaveBeenCalled();
        });

        it("requires administrator privileges (returns 403 for non-admin)", async () => {
            const res = await request(app)
                .get("/api/admin/products/prod-1")
                .set(USER_AUTH_HEADER);

            expect(res.status).toBe(403);
            expect(res.body).toEqual({ message: "Administrator privileges required" });
            expect(fake.productRepository.getProductById).not.toHaveBeenCalled();
        });

        it("returns 404 when product is not found", async () => {
            const res = await request(app)
                .get("/api/admin/products/nonexistent-id")
                .set(ADMIN_AUTH_HEADER);

            expect(res.status).toBe(404);
            expect(res.body).toEqual({ message: "Product not found." });
        });

        it("returns 200 with the full AdminProduct representation for an existing product", async () => {
            fake.setCategoriesList([
                { id: "cat-pasteleria", name: "Pastelería Fina", order: 1 }
            ]);
            fake.setProductsList([
                {
                    id: "prod-detail-1",
                    name: "Selva Negra",
                    description: "Pastel tradicional alemán",
                    price: 22000,
                    categoryId: "cat-pasteleria",
                    imageUrl: "https://example.com/selva-negra.jpg",
                    available: true,
                    status: "published",
                    createdAt: "2026-02-01T10:00:00.000Z",
                    updatedAt: "2026-02-02T10:00:00.000Z"
                }
            ]);

            const res = await request(app)
                .get("/api/admin/products/prod-detail-1")
                .set(ADMIN_AUTH_HEADER);

            expect(res.status).toBe(200);
            expect(res.body).toEqual({
                id: "prod-detail-1",
                name: "Selva Negra",
                description: "Pastel tradicional alemán",
                price: 22000,
                imageUrl: "https://example.com/selva-negra.jpg",
                available: true,
                status: "published",
                category: { id: "cat-pasteleria", name: "Pastelería Fina" },
                createdAt: "2026-02-01T10:00:00.000Z",
                updatedAt: "2026-02-02T10:00:00.000Z"
            });
        });

        it("returns 200 for a withdrawn product with status 'withdrawn'", async () => {
            fake.setProductsList([
                {
                    id: "prod-withdrawn-detail",
                    name: "Producto Retirado",
                    description: null,
                    price: 8000,
                    categoryId: null,
                    imageUrl: null,
                    available: false,
                    status: "withdrawn",
                    createdAt: "2026-01-01T00:00:00.000Z",
                    updatedAt: "2026-01-02T00:00:00.000Z"
                }
            ]);

            const res = await request(app)
                .get("/api/admin/products/prod-withdrawn-detail")
                .set(ADMIN_AUTH_HEADER);

            expect(res.status).toBe(200);
            expect(res.body.status).toBe("withdrawn");
            expect(res.body.available).toBe(false);
            expect(res.body.category).toBeNull();
        });

        it("returns clean 500 when repository lookup throws an unexpected error", async () => {
            fake.productRepository.getProductById.mockRejectedValueOnce(
                new Error("Firestore connection timed out")
            );

            const res = await request(app)
                .get("/api/admin/products/prod-fail")
                .set(ADMIN_AUTH_HEADER);

            expect(res.status).toBe(500);
            expect(res.body).toEqual({ message: "Could not retrieve product." });
            expect(JSON.stringify(res.body)).not.toContain("Firestore");
        });
    });

    describe("POST /api/admin/products", () => {
        const validPayload = {
            name: "Torta Chilena",
            description: "Capas crujientes con dulce de leche",
            price: 16000,
            categoryId: "cat-1",
            imageUrl: "https://example.com/chilena.jpg",
            available: false
        };

        beforeEach(() => {
            fake.setCategoriesList([
                { id: "cat-1", name: "Pasteles", order: 1 }
            ]);
        });

        it("requires authentication (returns 401 without token)", async () => {
            const res = await request(app)
                .post("/api/admin/products")
                .send(validPayload);

            expect(res.status).toBe(401);
            expect(res.body).toEqual({ message: "Authentication required" });
            expect(fake.productRepository.upsertProduct).not.toHaveBeenCalled();
        });

        it("requires administrator privileges (returns 403 for non-admin)", async () => {
            const res = await request(app)
                .post("/api/admin/products")
                .set(USER_AUTH_HEADER)
                .send(validPayload);

            expect(res.status).toBe(403);
            expect(res.body).toEqual({ message: "Administrator privileges required" });
            expect(fake.productRepository.upsertProduct).not.toHaveBeenCalled();
        });

        it("creates a product and returns 201 with the full AdminProduct representation", async () => {
            const res = await request(app)
                .post("/api/admin/products")
                .set(ADMIN_AUTH_HEADER)
                .send(validPayload);

            expect(res.status).toBe(201);
            expect(res.body.name).toBe("Torta Chilena");
            expect(res.body.description).toBe("Capas crujientes con dulce de leche");
            expect(res.body.price).toBe(16000);
            expect(res.body.imageUrl).toBe("https://example.com/chilena.jpg");
            expect(res.body.available).toBe(false);
            expect(res.body.status).toBe("published");
            expect(res.body.category).toEqual({ id: "cat-1", name: "Pasteles" });
            expect(typeof res.body.id).toBe("string");
            expect(res.body.id.length).toBeGreaterThan(10);
            expect(res.body.createdAt).toBeDefined();
            expect(res.body.updatedAt).toBeDefined();

            // Verify exact keys of AdminProduct
            const expectedKeys = [
                "available",
                "category",
                "createdAt",
                "description",
                "id",
                "imageUrl",
                "name",
                "price",
                "status",
                "updatedAt"
            ].sort();
            expect(Object.keys(res.body).sort()).toEqual(expectedKeys);
        });

        it("defaults available to true when omitted", async () => {
            const { available, ...payloadWithoutAvailable } = validPayload;
            const res = await request(app)
                .post("/api/admin/products")
                .set(ADMIN_AUTH_HEADER)
                .send(payloadWithoutAvailable);

            expect(res.status).toBe(201);
            expect(res.body.available).toBe(true);
        });

        it("sets optional description and imageUrl to null when omitted or blank", async () => {
            const minimalPayload = {
                name: "Pan Casero",
                price: 1500,
                categoryId: "cat-1"
            };

            const res = await request(app)
                .post("/api/admin/products")
                .set(ADMIN_AUTH_HEADER)
                .send(minimalPayload);

            expect(res.status).toBe(201);
            expect(res.body.description).toBeNull();
            expect(res.body.imageUrl).toBeNull();
        });

        it("returns 400 when required fields are missing", async () => {
            const res = await request(app)
                .post("/api/admin/products")
                .set(ADMIN_AUTH_HEADER)
                .send({});

            expect(res.status).toBe(400);
            expect(res.body.message).toBe("Validation failed.");
            expect(res.body.errors).toContain("name is required.");
            expect(res.body.errors).toContain("price must be an integer between 1 and 10000000.");
            expect(res.body.errors).toContain("categoryId is required.");
        });

        it("returns 400 when body is not a JSON object", async () => {
            const res = await request(app)
                .post("/api/admin/products")
                .set(ADMIN_AUTH_HEADER)
                .send(["not", "an", "object"]);

            expect(res.status).toBe(400);
            expect(res.body.errors).toContain("Product body must be a valid JSON object.");
        });

        it("returns 400 when price is 0, decimal, string, negative, or exceeds maximum", async () => {
            const invalidPrices = [0, 15.75, "15000", -500, 10_000_001];

            for (const invalidPrice of invalidPrices) {
                const res = await request(app)
                    .post("/api/admin/products")
                    .set(ADMIN_AUTH_HEADER)
                    .send({ ...validPayload, price: invalidPrice });

                expect(res.status).toBe(400);
                expect(res.body.errors).toEqual(
                    expect.arrayContaining([
                        "price must be an integer between 1 and 10000000."
                    ])
                );
            }
        });

        it("returns 400 when name is too short or too long", async () => {
            const shortRes = await request(app)
                .post("/api/admin/products")
                .set(ADMIN_AUTH_HEADER)
                .send({ ...validPayload, name: "AB" });

            expect(shortRes.status).toBe(400);
            expect(shortRes.body.errors).toContain("name must contain at least 3 characters.");

            const longRes = await request(app)
                .post("/api/admin/products")
                .set(ADMIN_AUTH_HEADER)
                .send({ ...validPayload, name: "A".repeat(121) });

            expect(longRes.status).toBe(400);
            expect(longRes.body.errors).toContain("name must not exceed 120 characters.");
        });

        it("returns 400 when imageUrl is not a valid http/https URL or exceeds length", async () => {
            const jsRes = await request(app)
                .post("/api/admin/products")
                .set(ADMIN_AUTH_HEADER)
                .send({ ...validPayload, imageUrl: "javascript:alert(1)" });

            expect(jsRes.status).toBe(400);
            expect(jsRes.body.errors).toContain("imageUrl must be a valid http or https URL.");

            const ftpRes = await request(app)
                .post("/api/admin/products")
                .set(ADMIN_AUTH_HEADER)
                .send({ ...validPayload, imageUrl: "ftp://example.com/cake.jpg" });

            expect(ftpRes.status).toBe(400);
            expect(ftpRes.body.errors).toContain("imageUrl must be a valid http or https URL.");

            const longUrlRes = await request(app)
                .post("/api/admin/products")
                .set(ADMIN_AUTH_HEADER)
                .send({ ...validPayload, imageUrl: "https://example.com/" + "a".repeat(500) });

            expect(longUrlRes.status).toBe(400);
            expect(longUrlRes.body.errors).toContain("imageUrl must not exceed 500 characters.");
        });

        it("returns 400 when categoryId references a nonexistent category", async () => {
            const res = await request(app)
                .post("/api/admin/products")
                .set(ADMIN_AUTH_HEADER)
                .send({ ...validPayload, categoryId: "nonexistent-category" });

            expect(res.status).toBe(400);
            expect(res.body.message).toBe("Validation failed.");
            expect(res.body.errors).toContain("categoryId must reference an existing category.");
        });

        it("ignores protected fields (status: 'withdrawn', id, createdAt, updatedAt) provided in the request body", async () => {
            const maliciousPayload = {
                ...validPayload,
                id: "client-provided-custom-id",
                status: "withdrawn",
                createdAt: "2020-01-01T00:00:00.000Z",
                updatedAt: "2020-01-01T00:00:00.000Z"
            };

            const res = await request(app)
                .post("/api/admin/products")
                .set(ADMIN_AUTH_HEADER)
                .send(maliciousPayload);

            expect(res.status).toBe(201);
            expect(res.body.id).not.toBe("client-provided-custom-id");
            expect(res.body.status).toBe("published");
            expect(res.body.createdAt).not.toBe("2020-01-01T00:00:00.000Z");
        });

        it("allows the created product to appear in GET /api/admin/products", async () => {
            const createRes = await request(app)
                .post("/api/admin/products")
                .set(ADMIN_AUTH_HEADER)
                .send(validPayload);

            expect(createRes.status).toBe(201);
            const createdId = createRes.body.id;

            const listRes = await request(app)
                .get("/api/admin/products")
                .set(ADMIN_AUTH_HEADER);

            expect(listRes.status).toBe(200);
            const found = listRes.body.find((p) => p.id === createdId);
            expect(found).toBeDefined();
            expect(found.name).toBe("Torta Chilena");
            expect(found.category).toEqual({ id: "cat-1", name: "Pasteles" });
        });

        it("returns clean 500 when product creation repository fails", async () => {
            fake.productRepository.upsertProduct.mockRejectedValueOnce(
                new Error("Firestore commit transaction lock timeout")
            );

            const res = await request(app)
                .post("/api/admin/products")
                .set(ADMIN_AUTH_HEADER)
                .send(validPayload);

            expect(res.status).toBe(500);
            expect(res.body).toEqual({ message: "Could not create product." });
            expect(JSON.stringify(res.body)).not.toContain("Firestore commit");
        });
    });

    describe("PUT /api/admin/products/:id", () => {
        const initialProduct = {
            id: "prod-update-1",
            name: "Queque Seco",
            description: "Queque tradicional de vainilla",
            price: 5000,
            categoryId: "cat-1",
            imageUrl: "https://example.com/queque.jpg",
            available: true,
            status: "published",
            createdAt: "2026-01-01T10:00:00.000Z",
            updatedAt: "2026-01-01T10:00:00.000Z"
        };

        const updatePayload = {
            name: "Queque Navideño Especial",
            description: "Con frutas confitadas y nueces",
            price: 8500,
            categoryId: "cat-2",
            imageUrl: "https://example.com/navideno.jpg",
            available: false
        };

        beforeEach(() => {
            fake.setCategoriesList([
                { id: "cat-1", name: "Tradicionales", order: 1 },
                { id: "cat-2", name: "Especiales", order: 2 }
            ]);
            fake.setProductsList([
                { ...initialProduct }
            ]);
        });

        it("requires authentication (returns 401 without token)", async () => {
            const res = await request(app)
                .put(`/api/admin/products/${initialProduct.id}`)
                .send(updatePayload);

            expect(res.status).toBe(401);
            expect(res.body).toEqual({ message: "Authentication required" });
            expect(fake.productRepository.upsertProduct).not.toHaveBeenCalled();
        });

        it("requires administrator privileges (returns 403 for non-admin)", async () => {
            const res = await request(app)
                .put(`/api/admin/products/${initialProduct.id}`)
                .set(USER_AUTH_HEADER)
                .send(updatePayload);

            expect(res.status).toBe(403);
            expect(res.body).toEqual({ message: "Administrator privileges required" });
            expect(fake.productRepository.upsertProduct).not.toHaveBeenCalled();
        });

        it("updates name, description, price, category and availability, returning 200 with AdminProduct", async () => {
            const res = await request(app)
                .put(`/api/admin/products/${initialProduct.id}`)
                .set(ADMIN_AUTH_HEADER)
                .send(updatePayload);

            expect(res.status).toBe(200);
            expect(res.body.id).toBe(initialProduct.id);
            expect(res.body.name).toBe("Queque Navideño Especial");
            expect(res.body.description).toBe("Con frutas confitadas y nueces");
            expect(res.body.price).toBe(8500);
            expect(res.body.category).toEqual({ id: "cat-2", name: "Especiales" });
            expect(res.body.imageUrl).toBe("https://example.com/navideno.jpg");
            expect(res.body.available).toBe(false);
            expect(res.body.status).toBe("published");
            expect(res.body.createdAt).toBe(initialProduct.createdAt);
            expect(new Date(res.body.updatedAt).getTime()).toBeGreaterThan(
                new Date(initialProduct.updatedAt).getTime()
            );
        });

        it("preserves current availability when available is omitted in the update payload", async () => {
            const { available, ...payloadWithoutAvailable } = updatePayload;

            const res = await request(app)
                .put(`/api/admin/products/${initialProduct.id}`)
                .set(ADMIN_AUTH_HEADER)
                .send(payloadWithoutAvailable);

            expect(res.status).toBe(200);
            expect(res.body.available).toBe(true); // preserved from initialProduct.available
        });

        it("sets description and imageUrl to null when omitted or blank in update payload", async () => {
            const payloadWithoutDescAndImage = {
                name: "Queque Básico",
                price: 4000,
                categoryId: "cat-1"
            };

            const res = await request(app)
                .put(`/api/admin/products/${initialProduct.id}`)
                .set(ADMIN_AUTH_HEADER)
                .send(payloadWithoutDescAndImage);

            expect(res.status).toBe(200);
            expect(res.body.description).toBeNull();
            expect(res.body.imageUrl).toBeNull();
        });

        it("preserves id, status and createdAt and does not allow client to overwrite them", async () => {
            const maliciousPayload = {
                ...updatePayload,
                id: "hacked-id",
                status: "withdrawn",
                createdAt: "2019-01-01T00:00:00.000Z"
            };

            const res = await request(app)
                .put(`/api/admin/products/${initialProduct.id}`)
                .set(ADMIN_AUTH_HEADER)
                .send(maliciousPayload);

            expect(res.status).toBe(200);
            expect(res.body.id).toBe(initialProduct.id);
            expect(res.body.status).toBe("published");
            expect(res.body.createdAt).toBe(initialProduct.createdAt);
        });

        it("returns 404 when product does not exist", async () => {
            const res = await request(app)
                .put("/api/admin/products/nonexistent-product-id")
                .set(ADMIN_AUTH_HEADER)
                .send(updatePayload);

            expect(res.status).toBe(404);
            expect(res.body).toEqual({ message: "Product not found." });
        });

        it("returns 409 Conflict when attempting to update a withdrawn product", async () => {
            fake.setProductsList([
                {
                    ...initialProduct,
                    id: "prod-withdrawn-1",
                    status: "withdrawn"
                }
            ]);

            const res = await request(app)
                .put("/api/admin/products/prod-withdrawn-1")
                .set(ADMIN_AUTH_HEADER)
                .send(updatePayload);

            expect(res.status).toBe(409);
            expect(res.body).toEqual({ message: "Removed products cannot be updated." });
        });

        it("returns 400 when categoryId does not reference an existing category", async () => {
            const res = await request(app)
                .put(`/api/admin/products/${initialProduct.id}`)
                .set(ADMIN_AUTH_HEADER)
                .send({ ...updatePayload, categoryId: "cat-ghost" });

            expect(res.status).toBe(400);
            expect(res.body.errors).toContain("categoryId must reference an existing category.");
        });

        it("returns 400 when validation rules fail (e.g. invalid price or name)", async () => {
            const res = await request(app)
                .put(`/api/admin/products/${initialProduct.id}`)
                .set(ADMIN_AUTH_HEADER)
                .send({ ...updatePayload, price: -50, name: "X" });

            expect(res.status).toBe(400);
            expect(res.body.errors).toContain("name must contain at least 3 characters.");
            expect(res.body.errors).toContain("price must be an integer between 1 and 10000000.");
        });

        it("reflects the update when subsequently fetching GET /api/admin/products/:id", async () => {
            const updateRes = await request(app)
                .put(`/api/admin/products/${initialProduct.id}`)
                .set(ADMIN_AUTH_HEADER)
                .send(updatePayload);

            expect(updateRes.status).toBe(200);

            const detailRes = await request(app)
                .get(`/api/admin/products/${initialProduct.id}`)
                .set(ADMIN_AUTH_HEADER);

            expect(detailRes.status).toBe(200);
            expect(detailRes.body.name).toBe("Queque Navideño Especial");
            expect(detailRes.body.price).toBe(8500);
            expect(detailRes.body.available).toBe(false);
            expect(detailRes.body.category).toEqual({ id: "cat-2", name: "Especiales" });
        });

        it("returns clean 500 when product update repository fails", async () => {
            fake.productRepository.upsertProduct.mockRejectedValueOnce(
                new Error("Firestore database write lock failure")
            );

            const res = await request(app)
                .put(`/api/admin/products/${initialProduct.id}`)
                .set(ADMIN_AUTH_HEADER)
                .send(updatePayload);

            expect(res.status).toBe(500);
            expect(res.body).toEqual({ message: "Could not update product." });
            expect(JSON.stringify(res.body)).not.toContain("database write lock");
        });
    });

    describe("DELETE /api/admin/products/:id", () => {
        const productToRemove = {
            id: "prod-del-1",
            name: "Pastel a Retirar",
            description: "Para dar de baja",
            price: 10000,
            categoryId: "cat-1",
            imageUrl: "https://example.com/del.jpg",
            available: true,
            status: "published",
            createdAt: "2026-01-01T10:00:00.000Z",
            updatedAt: "2026-01-01T10:00:00.000Z"
        };

        beforeEach(() => {
            fake.setCategoriesList([
                { id: "cat-1", name: "Pasteles", order: 1 }
            ]);
            fake.setProductsList([
                { ...productToRemove }
            ]);
        });

        it("requires authentication (returns 401 without token)", async () => {
            const res = await request(app)
                .delete(`/api/admin/products/${productToRemove.id}`);

            expect(res.status).toBe(401);
            expect(res.body).toEqual({ message: "Authentication required" });
            expect(fake.productRepository.upsertProduct).not.toHaveBeenCalled();
        });

        it("requires administrator privileges (returns 403 for non-admin)", async () => {
            const res = await request(app)
                .delete(`/api/admin/products/${productToRemove.id}`)
                .set(USER_AUTH_HEADER);

            expect(res.status).toBe(403);
            expect(res.body).toEqual({ message: "Administrator privileges required" });
            expect(fake.productRepository.upsertProduct).not.toHaveBeenCalled();
        });

        it("returns 204 with no body and marks the product status as withdrawn in detail view", async () => {
            const res = await request(app)
                .delete(`/api/admin/products/${productToRemove.id}`)
                .set(ADMIN_AUTH_HEADER);

            expect(res.status).toBe(204);
            expect(res.text).toBe("");

            const detailRes = await request(app)
                .get(`/api/admin/products/${productToRemove.id}`)
                .set(ADMIN_AUTH_HEADER);

            expect(detailRes.status).toBe(200);
            expect(detailRes.body.status).toBe("withdrawn");
        });

        it("keeps the withdrawn product visible in the admin products list", async () => {
            await request(app)
                .delete(`/api/admin/products/${productToRemove.id}`)
                .set(ADMIN_AUTH_HEADER);

            const listRes = await request(app)
                .get("/api/admin/products")
                .set(ADMIN_AUTH_HEADER);

            expect(listRes.status).toBe(200);
            const found = listRes.body.find((p) => p.id === productToRemove.id);
            expect(found).toBeDefined();
            expect(found.status).toBe("withdrawn");
        });

        it("is idempotent: deleting an already withdrawn product returns 204", async () => {
            const firstDelete = await request(app)
                .delete(`/api/admin/products/${productToRemove.id}`)
                .set(ADMIN_AUTH_HEADER);

            expect(firstDelete.status).toBe(204);

            const secondDelete = await request(app)
                .delete(`/api/admin/products/${productToRemove.id}`)
                .set(ADMIN_AUTH_HEADER);

            expect(secondDelete.status).toBe(204);
        });

        it("returns 404 when product does not exist", async () => {
            const res = await request(app)
                .delete("/api/admin/products/nonexistent-product-id")
                .set(ADMIN_AUTH_HEADER);

            expect(res.status).toBe(404);
            expect(res.body).toEqual({ message: "Product not found." });
        });

        it("returns clean 500 when product removal repository fails", async () => {
            fake.productRepository.upsertProduct.mockRejectedValueOnce(
                new Error("Firestore node replica sync failure")
            );

            const res = await request(app)
                .delete(`/api/admin/products/${productToRemove.id}`)
                .set(ADMIN_AUTH_HEADER);

            expect(res.status).toBe(500);
            expect(res.body).toEqual({ message: "Could not remove product." });
            expect(JSON.stringify(res.body)).not.toContain("replica sync");
        });
    });

    describe("GET /api/admin/categories", () => {
        it("requires authentication (returns 401 without token)", async () => {
            const res = await request(app).get("/api/admin/categories");

            expect(res.status).toBe(401);
            expect(res.body).toEqual({ message: "Authentication required" });
            expect(fake.categoryRepository.getCategories).not.toHaveBeenCalled();
        });

        it("requires administrator privileges (returns 403 for non-admin)", async () => {
            const res = await request(app)
                .get("/api/admin/categories")
                .set(USER_AUTH_HEADER);

            expect(res.status).toBe(403);
            expect(res.body).toEqual({ message: "Administrator privileges required" });
            expect(fake.categoryRepository.getCategories).not.toHaveBeenCalled();
        });

        it("returns an empty array when no categories exist", async () => {
            const res = await request(app)
                .get("/api/admin/categories")
                .set(ADMIN_AUTH_HEADER);

            expect(res.status).toBe(200);
            expect(res.body).toEqual([]);
        });

        it("returns categories with exact fields { id, name, order } without internal timestamps", async () => {
            fake.setCategoriesList([
                {
                    id: "cat-1",
                    name: "Tortas Frías",
                    order: 1,
                    createdAt: "2026-01-01T00:00:00.000Z",
                    updatedAt: "2026-01-01T00:00:00.000Z"
                },
                {
                    id: "cat-2",
                    name: "Galletas",
                    order: 2,
                    createdAt: "2026-01-01T00:00:00.000Z",
                    updatedAt: "2026-01-01T00:00:00.000Z"
                }
            ]);

            const res = await request(app)
                .get("/api/admin/categories")
                .set(ADMIN_AUTH_HEADER);

            expect(res.status).toBe(200);
            expect(res.body).toEqual([
                { id: "cat-1", name: "Tortas Frías", order: 1 },
                { id: "cat-2", name: "Galletas", order: 2 }
            ]);
            expect(res.body[0].createdAt).toBeUndefined();
            expect(res.body[0].updatedAt).toBeUndefined();
        });

        it("returns clean 500 when categories repository throws an unexpected error", async () => {
            fake.categoryRepository.getCategories.mockRejectedValueOnce(
                new Error("Database disk quota exceeded")
            );

            const res = await request(app)
                .get("/api/admin/categories")
                .set(ADMIN_AUTH_HEADER);

            expect(res.status).toBe(500);
            expect(res.body).toEqual({ message: "Could not retrieve categories." });
            expect(JSON.stringify(res.body)).not.toContain("disk quota");
        });
    });

    describe("Public Catalog Cache Invalidation on Administrative Changes (Rama 6 / CIU-6)", () => {
        beforeEach(() => {
            vi.useFakeTimers();
            fake.setCategoriesList([
                { id: "cat-1", name: "Pastelería", order: 1 }
            ]);
            fake.setProductsList([
                {
                    id: "prod-cached-1",
                    name: "Pastel de Fresa",
                    description: "Con fresas frescas",
                    price: 12000,
                    categoryId: "cat-1",
                    imageUrl: "https://example.com/fresa.jpg",
                    available: true,
                    status: "published",
                    createdAt: "2026-01-01T00:00:00.000Z",
                    updatedAt: "2026-01-01T00:00:00.000Z"
                }
            ]);
        });

        it("populates the public cache on GET /api/products, and creating a product shows it immediately without waiting for cache TTL", async () => {
            const initialPublic = await request(app).get("/api/products");
            expect(initialPublic.status).toBe(200);
            expect(initialPublic.body.items).toHaveLength(1);
            expect(initialPublic.body.items[0].name).toBe("Pastel de Fresa");

            vi.advanceTimersByTime(5_000);

            const createRes = await request(app)
                .post("/api/admin/products")
                .set(ADMIN_AUTH_HEADER)
                .send({
                    name: "Pastel Selva Negra",
                    price: 15000,
                    categoryId: "cat-1"
                });
            expect(createRes.status).toBe(201);

            const afterCreatePublic = await request(app).get("/api/products");
            expect(afterCreatePublic.status).toBe(200);
            expect(afterCreatePublic.body.items).toHaveLength(2);
            const names = afterCreatePublic.body.items.map((i) => i.name);
            expect(names).toContain("Pastel Selva Negra");
        });

        it("reflects updated price immediately in the public catalog", async () => {
            const initialPublic = await request(app).get("/api/products");
            expect(initialPublic.body.items[0].price).toBe(12000);

            vi.advanceTimersByTime(10_000);

            const updateRes = await request(app)
                .put("/api/admin/products/prod-cached-1")
                .set(ADMIN_AUTH_HEADER)
                .send({
                    name: "Pastel de Fresa",
                    price: 14500,
                    categoryId: "cat-1"
                });
            expect(updateRes.status).toBe(200);

            const afterUpdatePublic = await request(app).get("/api/products");
            expect(afterUpdatePublic.body.items[0].price).toBe(14500);
        });

        it("reflects updated availability immediately in the public catalog", async () => {
            const initialPublic = await request(app).get("/api/products");
            expect(initialPublic.body.items[0].available).toBe(true);

            vi.advanceTimersByTime(10_000);

            const updateRes = await request(app)
                .put("/api/admin/products/prod-cached-1")
                .set(ADMIN_AUTH_HEADER)
                .send({
                    name: "Pastel de Fresa",
                    price: 12000,
                    categoryId: "cat-1",
                    available: false
                });
            expect(updateRes.status).toBe(200);

            const afterUpdatePublic = await request(app).get("/api/products");
            expect(afterUpdatePublic.body.items[0].available).toBe(false);
        });

        it("removes product immediately from public catalog while remaining visible in admin list", async () => {
            const initialPublic = await request(app).get("/api/products");
            expect(initialPublic.body.items).toHaveLength(1);

            vi.advanceTimersByTime(10_000);

            const deleteRes = await request(app)
                .delete("/api/admin/products/prod-cached-1")
                .set(ADMIN_AUTH_HEADER);
            expect(deleteRes.status).toBe(204);

            const afterDeletePublic = await request(app).get("/api/products");
            expect(afterDeletePublic.body.items).toHaveLength(0);

            const adminList = await request(app)
                .get("/api/admin/products")
                .set(ADMIN_AUTH_HEADER);
            expect(adminList.status).toBe(200);
            expect(adminList.body).toHaveLength(1);
            expect(adminList.body[0].id).toBe("prod-cached-1");
            expect(adminList.body[0].status).toBe("withdrawn");
        });

        it("ensures a withdrawn product does not reappear in public catalog after time advances", async () => {
            await request(app)
                .delete("/api/admin/products/prod-cached-1")
                .set(ADMIN_AUTH_HEADER);

            vi.advanceTimersByTime(120_000);

            const publicRes = await request(app).get("/api/products");
            expect(publicRes.body.items).toHaveLength(0);
        });

        it("does not invalidate cache when an administrative write fails", async () => {
            const initialPublic = await request(app).get("/api/products");
            expect(initialPublic.body.items).toHaveLength(1);

            vi.advanceTimersByTime(10_000);

            fake.productRepository.upsertProduct.mockRejectedValueOnce(
                new Error("Firestore transient failure")
            );

            const updateRes = await request(app)
                .put("/api/admin/products/prod-cached-1")
                .set(ADMIN_AUTH_HEADER)
                .send({
                    name: "Nombre Modificado Que Falla",
                    price: 99999,
                    categoryId: "cat-1"
                });
            expect(updateRes.status).toBe(500);

            const publicRes = await request(app).get("/api/products");
            expect(publicRes.body.items[0].name).toBe("Pastel de Fresa");
            expect(publicRes.body.items[0].price).toBe(12000);
        });
    });

    describe("Product Administration Authentication and Authorization Matrix (Rama 7 / CIU-6)", () => {
        beforeEach(() => {
            fake.setCategoriesList([
                { id: "cat-auth-1", name: "Categoría Auth", order: 1 }
            ]);
            fake.setProductsList([
                {
                    id: "prod-auth-1",
                    name: "Producto Auth",
                    description: "Para pruebas de autorización",
                    price: 10000,
                    categoryId: "cat-auth-1",
                    imageUrl: null,
                    available: true,
                    status: "published",
                    createdAt: "2026-01-01T00:00:00.000Z",
                    updatedAt: "2026-01-01T00:00:00.000Z"
                }
            ]);
        });

        const endpoints = [
            {
                name: "GET /api/admin/categories",
                call: (auth) => {
                    const req = request(app).get("/api/admin/categories");
                    return auth ? req.set("Authorization", auth) : req;
                },
                expectedSuccessStatus: 200,
                checkReposNotCalled: () => {
                    expect(fake.categoryRepository.getCategories).not.toHaveBeenCalled();
                }
            },
            {
                name: "GET /api/admin/products",
                call: (auth) => {
                    const req = request(app).get("/api/admin/products");
                    return auth ? req.set("Authorization", auth) : req;
                },
                expectedSuccessStatus: 200,
                checkReposNotCalled: () => {
                    expect(fake.productRepository.getAllProducts).not.toHaveBeenCalled();
                }
            },
            {
                name: "GET /api/admin/products/:id",
                call: (auth) => {
                    const req = request(app).get("/api/admin/products/prod-auth-1");
                    return auth ? req.set("Authorization", auth) : req;
                },
                expectedSuccessStatus: 200,
                checkReposNotCalled: () => {
                    expect(fake.productRepository.getProductById).not.toHaveBeenCalled();
                }
            },
            {
                name: "POST /api/admin/products",
                call: (auth) => {
                    const req = request(app).post("/api/admin/products").send({
                        name: "Producto Nuevo",
                        price: 5000,
                        categoryId: "cat-auth-1"
                    });
                    return auth ? req.set("Authorization", auth) : req;
                },
                expectedSuccessStatus: 201,
                checkReposNotCalled: () => {
                    expect(fake.productRepository.upsertProduct).not.toHaveBeenCalled();
                }
            },
            {
                name: "PUT /api/admin/products/:id",
                call: (auth) => {
                    const req = request(app).put("/api/admin/products/prod-auth-1").send({
                        name: "Producto Editado",
                        price: 6000,
                        categoryId: "cat-auth-1"
                    });
                    return auth ? req.set("Authorization", auth) : req;
                },
                expectedSuccessStatus: 200,
                checkReposNotCalled: () => {
                    expect(fake.productRepository.getProductById).not.toHaveBeenCalled();
                    expect(fake.productRepository.upsertProduct).not.toHaveBeenCalled();
                }
            },
            {
                name: "DELETE /api/admin/products/:id",
                call: (auth) => {
                    const req = request(app).delete("/api/admin/products/prod-auth-1");
                    return auth ? req.set("Authorization", auth) : req;
                },
                expectedSuccessStatus: 204,
                checkReposNotCalled: () => {
                    expect(fake.productRepository.getProductById).not.toHaveBeenCalled();
                    expect(fake.productRepository.upsertProduct).not.toHaveBeenCalled();
                }
            }
        ];

        endpoints.forEach(({ name, call, expectedSuccessStatus, checkReposNotCalled }) => {
            describe(name, () => {
                it("returns 401 without token and never invokes repository", async () => {
                    const res = await call(null);
                    expect(res.status).toBe(401);
                    expect(res.body).toEqual({ message: "Authentication required" });
                    checkReposNotCalled();
                });

                it("returns 401 with invalid token and never invokes repository", async () => {
                    const res = await call("Bearer invalid-token-xyz");
                    expect(res.status).toBe(401);
                    expect(res.body).toEqual({ message: "Invalid or expired authentication token" });
                    checkReposNotCalled();
                });

                it("returns 403 for non-admin user and never invokes repository", async () => {
                    const res = await call("Bearer regular-user-token");
                    expect(res.status).toBe(403);
                    expect(res.body).toEqual({ message: "Administrator privileges required" });
                    checkReposNotCalled();
                });

                it("succeeds for authenticated administrator", async () => {
                    const res = await call("Bearer valid-admin-token");
                    expect(res.status).toBe(expectedSuccessStatus);
                });
            });
        });

        describe("Public endpoints isolation", () => {
            it("verifies GET /api/products remains public without requiring token", async () => {
                const res = await request(app).get("/api/products");
                expect(res.status).toBe(200);
                expect(fake.verifyIdToken).not.toHaveBeenCalled();
            });

            it("verifies POST, PUT, DELETE on /api/products return 404 (not routable publicly)", async () => {
                const postRes = await request(app).post("/api/products").send({ name: "Test" });
                expect(postRes.status).toBe(404);

                const putRes = await request(app).put("/api/products/prod-auth-1").send({ name: "Test" });
                expect(putRes.status).toBe(404);

                const delRes = await request(app).delete("/api/products/prod-auth-1");
                expect(delRes.status).toBe(404);
            });
        });
    });

    describe("OpenAPI Documentation Compliance", () => {
        it("defines /admin/categories, /admin/products and /admin/products/{id} paths and matching schemas", () => {
            const rawYaml = fs.readFileSync(openApiPath, "utf8");
            const doc = YAML.parse(rawYaml);

            expect(doc.paths["/admin/categories"]).toBeDefined();
            expect(doc.paths["/admin/categories"].get.tags).toContain("Admin Products");

            expect(doc.paths["/admin/products"]).toBeDefined();
            expect(doc.paths["/admin/products"].get.tags).toContain("Admin Products");
            expect(doc.paths["/admin/products"].post).toBeDefined();
            expect(doc.paths["/admin/products"].post.tags).toContain("Admin Products");

            expect(doc.paths["/admin/products/{id}"]).toBeDefined();
            expect(doc.paths["/admin/products/{id}"].get.tags).toContain("Admin Products");
            expect(doc.paths["/admin/products/{id}"].put).toBeDefined();
            expect(doc.paths["/admin/products/{id}"].put.tags).toContain("Admin Products");
            expect(doc.paths["/admin/products/{id}"].delete).toBeDefined();
            expect(doc.paths["/admin/products/{id}"].delete.tags).toContain("Admin Products");

            expect(doc.components.schemas.AdminProduct).toBeDefined();
            expect(doc.components.schemas.AdminCategory).toBeDefined();
            expect(doc.components.schemas.CreateProductRequest).toBeDefined();

            const adminProductProps = Object.keys(doc.components.schemas.AdminProduct.properties).sort();
            const expectedProps = [
                "available",
                "category",
                "createdAt",
                "description",
                "id",
                "imageUrl",
                "name",
                "price",
                "status",
                "updatedAt"
            ].sort();
            expect(adminProductProps).toEqual(expectedProps);

            const adminCategoryProps = Object.keys(doc.components.schemas.AdminCategory.properties).sort();
            expect(adminCategoryProps).toEqual(["id", "name", "order"]);

            const createProductProps = Object.keys(doc.components.schemas.CreateProductRequest.properties).sort();
            expect(createProductProps).toEqual([
                "available",
                "categoryId",
                "description",
                "imageUrl",
                "name",
                "price"
            ]);
        });
    });
});
