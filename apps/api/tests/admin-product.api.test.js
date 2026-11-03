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
            upsertProduct: vi.fn((product) => {
                const now = new Date().toISOString();
                const existingIndex = productsList.findIndex((p) => p.id === product.id);
                const saved = {
                    ...product,
                    createdAt: existingIndex >= 0 ? productsList[existingIndex].createdAt : now,
                    updatedAt: now
                };
                if (existingIndex >= 0) {
                    productsList[existingIndex] = saved;
                } else {
                    productsList.push(saved);
                }
                return Promise.resolve(saved);
            })
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

    describe("OpenAPI Documentation Compliance", () => {
        it("defines /admin/categories, /admin/products and /admin/products/{id} paths and matching schemas", () => {
            const rawYaml = fs.readFileSync(openApiPath, "utf8");
            const doc = YAML.parse(rawYaml);

            expect(doc.paths["/admin/categories"]).toBeDefined();
            expect(doc.paths["/admin/categories"].get.tags).toContain("Admin Products");

            expect(doc.paths["/admin/products"]).toBeDefined();
            expect(doc.paths["/admin/products"].get.tags).toContain("Admin Products");

            expect(doc.paths["/admin/products/{id}"]).toBeDefined();
            expect(doc.paths["/admin/products/{id}"].get.tags).toContain("Admin Products");

            expect(doc.components.schemas.AdminProduct).toBeDefined();
            expect(doc.components.schemas.AdminCategory).toBeDefined();

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
        });
    });
});
