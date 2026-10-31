import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

import { buildSeedData } from "../scripts/seed-products.js";

// HU-T02: GET /api/products/:id (public product detail)
const fake = vi.hoisted(() => {
    const state = { products: new Map(), categories: new Map() };

    return {
        state,
        verifyIdToken: vi.fn(),
        productRepository: {
            getPublishedProducts: vi.fn(async () =>
                [...state.products.values()].filter((p) => p.status === "published")
            ),
            getProductById: vi.fn(async (id) => state.products.get(id) ?? null),
            upsertProduct: vi.fn()
        },
        categoryRepository: {
            getCategories: vi.fn(async () => [...state.categories.values()]),
            getCategoryById: vi.fn(async (id) => state.categories.get(id) ?? null),
            upsertCategory: vi.fn()
        }
    };
});

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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const openApiPath = path.join(__dirname, "../docs/openapi.yaml");

const DETAIL_KEYS = [
    "available",
    "brand",
    "category",
    "description",
    "id",
    "imageUrl",
    "name",
    "price",
    "size",
    "weight"
].sort();

// Stored products carry internal fields that must never reach the public API.
function stored(product) {
    return {
        ...product,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-02T00:00:00.000Z",
        internalNote: "solo administración"
    };
}

function loadSeed() {
    const { categories, products } = buildSeedData();
    fake.state.categories = new Map(categories.map((c) => [c.id, { ...c, createdAt: "x", updatedAt: "y" }]));
    fake.state.products = new Map(products.map((p) => [p.id, stored(p)]));
}

describe("GET /api/products/:id (HU-T02)", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        loadSeed();
    });

    it("returns a visible product with all its public fields", async () => {
        const response = await request(app).get("/api/products/seed-prod-01");

        expect(response.status).toBe(200);
        expect(response.body).toEqual({
            id: "seed-prod-01",
            name: "Harina de trigo todo uso 1 kg",
            brand: "Molinos del Valle",
            description: "Harina de trigo todo uso de alta calidad para repostería y panadería.",
            weight: "1 kg",
            size: null,
            price: 1450,
            imageUrl: expect.stringMatching(/^https:\/\//),
            available: true,
            category: { id: "seed-cat-1", name: "Harinas y mezclas" }
        });
    });

    it("matches the data registered in the database for every published seed product", async () => {
        const { products, categories } = buildSeedData();
        const categoryName = new Map(categories.map((c) => [c.id, c.name]));

        for (const product of products.filter((p) => p.status === "published")) {
            const response = await request(app).get(`/api/products/${product.id}`);
            expect(response.status).toBe(200);
            expect(response.body).toMatchObject({
                id: product.id,
                name: product.name,
                brand: product.brand,
                description: product.description,
                weight: product.weight,
                size: product.size,
                price: product.price,
                available: product.available,
                category: { id: product.categoryId, name: categoryName.get(product.categoryId) }
            });
        }
    });

    it("works without authentication and never verifies a token", async () => {
        const response = await request(app).get("/api/products/seed-prod-05");

        expect(response.status).toBe(200);
        expect(fake.verifyIdToken).not.toHaveBeenCalled();
    });

    it("ignores an invalid Authorization header (public endpoint)", async () => {
        const response = await request(app)
            .get("/api/products/seed-prod-05")
            .set("Authorization", "Bearer basura");

        expect(response.status).toBe(200);
    });

    it("exposes exactly the public fields and no internal ones", async () => {
        const response = await request(app).get("/api/products/seed-prod-07");

        expect(Object.keys(response.body).sort()).toEqual(DETAIL_KEYS);
        for (const field of ["status", "categoryId", "createdAt", "updatedAt", "internalNote"]) {
            expect(response.body).not.toHaveProperty(field);
        }
        expect(Object.keys(response.body.category).sort()).toEqual(["id", "name"]);
    });

    it("returns out-of-stock products with available false", async () => {
        const response = await request(app).get("/api/products/seed-prod-07");

        expect(response.status).toBe(200);
        expect(response.body.available).toBe(false);
    });

    it("returns null image, brand and description when the product has none", async () => {
        const response = await request(app).get("/api/products/seed-prod-15");

        expect(response.status).toBe(200);
        expect(response.body).toMatchObject({ imageUrl: null, brand: null, description: null, weight: "100 g" });
    });

    it("returns 404 for a hidden (withdrawn) product, even with its direct link", async () => {
        const response = await request(app).get("/api/products/seed-prod-17");

        expect(response.status).toBe(404);
        expect(response.body).toEqual({ message: "Product not found." });
    });

    it("returns 404 for a product with an unknown status", async () => {
        fake.state.products.set("raro", stored({ ...fake.state.products.get("seed-prod-01"), id: "raro", status: "draft" }));

        const response = await request(app).get("/api/products/raro");
        expect(response.status).toBe(404);
    });

    it("returns 404 for a product that does not exist", async () => {
        const response = await request(app).get("/api/products/no-existe");

        expect(response.status).toBe(404);
        expect(response.body).toEqual({ message: "Product not found." });
    });

    it("hidden and non-existent products get the same answer (nothing leaks)", async () => {
        const hidden = await request(app).get("/api/products/seed-prod-18");
        const missing = await request(app).get("/api/products/seed-prod-99");

        expect(hidden.status).toBe(missing.status);
        expect(hidden.body).toEqual(missing.body);
    });

    it("answers 404 for malformed IDs without querying the database", async () => {
        for (const id of ["a%2Fb", "x".repeat(129), "hola%20mundo", "%2E%2E"]) {
            const response = await request(app).get(`/api/products/${id}`);
            expect(response.status).toBe(404);
        }
        expect(fake.productRepository.getProductById).not.toHaveBeenCalled();
    });

    it("returns category null when the product's category no longer exists", async () => {
        fake.state.categories.delete("seed-cat-1");

        const response = await request(app).get("/api/products/seed-prod-02");
        expect(response.status).toBe(200);
        expect(response.body.category).toBeNull();
    });

    it("drops unsafe image URLs", async () => {
        fake.state.products.set("seed-prod-01", stored({
            ...fake.state.products.get("seed-prod-01"),
            imageUrl: "javascript:alert(1)"
        }));

        const response = await request(app).get("/api/products/seed-prod-01");
        expect(response.body.imageUrl).toBeNull();
    });

    it("reflects a withdrawal immediately (does not use the catalog cache)", async () => {
        expect((await request(app).get("/api/products/seed-prod-01")).status).toBe(200);

        fake.state.products.set("seed-prod-01", { ...fake.state.products.get("seed-prod-01"), status: "withdrawn" });
        expect((await request(app).get("/api/products/seed-prod-01")).status).toBe(404);
    });

    it("returns a safe 500 when the database fails", async () => {
        const spy = vi.spyOn(console, "error").mockImplementation(() => {});
        fake.productRepository.getProductById.mockRejectedValueOnce(new Error("Firestore caído con detalles internos"));

        const response = await request(app).get("/api/products/seed-prod-01");

        expect(response.status).toBe(500);
        expect(response.body).toEqual({ message: "Could not load the product." });
        spy.mockRestore();
    });

    it("keeps the catalog list working and unchanged", async () => {
        const response = await request(app).get("/api/products?categoryId=seed-cat-2");

        expect(response.status).toBe(200);
        expect(response.body.total).toBe(3);
        expect(response.body.items[0]).not.toHaveProperty("brand");
    });

    it("is documented in OpenAPI with the PublicProductDetail schema", () => {
        const doc = YAML.parseDocument(fs.readFileSync(openApiPath, "utf8"));
        expect(doc.errors).toEqual([]);
        const spec = doc.toJS();

        const operation = spec.paths["/products/{id}"].get;
        expect(operation.security).toEqual([]);
        expect(Object.keys(operation.responses)).toEqual(expect.arrayContaining(["200", "404", "500"]));
        expect(spec.components.schemas.PublicProductDetail.required.slice().sort()).toEqual(DETAIL_KEYS);
    });
});
