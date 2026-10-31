import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

import { buildSeedData } from "../scripts/seed-products.js";
import { normalizeSearchText, toSearchTerms } from "../src/utils/search-text.js";

// HU-T03: GET /api/products?q=... (text search in the public catalog)
const fake = vi.hoisted(() => {
    const state = { products: [], categories: [] };

    return {
        state,
        verifyIdToken: vi.fn(),
        productRepository: {
            getPublishedProducts: vi.fn(async () => state.products.filter((p) => p.status === "published")),
            getProductById: vi.fn(),
            upsertProduct: vi.fn()
        },
        categoryRepository: {
            getCategories: vi.fn(async () => [...state.categories]),
            getCategoryById: vi.fn(),
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
import { invalidateProductCatalogCache } from "../src/services/product.service.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const openApiPath = path.join(__dirname, "../docs/openapi.yaml");

const extraProducts = [
    { id: "x-jabon", name: "Jabón líquido para manos 500 ml", brand: "Limpio", description: null, price: 2200, categoryId: "seed-cat-6", imageUrl: null, available: true, status: "published" },
    { id: "x-oscuro", name: "Chocolate oscuro 70% 200 g", brand: "Cacao Real", description: "Ideal para ganache.", price: 3900, categoryId: "seed-cat-2", imageUrl: null, available: true, status: "published" },
    { id: "x-fondant", name: "Fondant blanco 1 kg", brand: "Dulce Arte", description: "Pasta para cubrir pasteles.", price: 5200, categoryId: "seed-cat-5", imageUrl: null, available: false, status: "published" },
    { id: "x-oculto", name: "Fondant oculto de prueba", brand: "Dulce Arte", description: null, price: 1000, categoryId: "seed-cat-5", imageUrl: null, available: true, status: "withdrawn" }
];

function loadCatalog(products = [...buildSeedData().products, ...extraProducts]) {
    fake.state.categories = buildSeedData().categories;
    fake.state.products = products;
}

const search = (query) => request(app).get(`/api/products?${query}`);
const ids = (response) => response.body.items.map((item) => item.id);
const names = (response) => response.body.items.map((item) => item.name);

describe("search text normalization", () => {
    it("ignores uppercase, accents and punctuation", () => {
        expect(normalizeSearchText("  JABÓN líquido, 500-ml ")).toBe("jabon liquido 500 ml");
        expect(normalizeSearchText("Piña")).toBe("pina");
        expect(normalizeSearchText(null)).toBe("");
    });

    it("ignores searches shorter than 2 characters", () => {
        expect(toSearchTerms("a")).toBeNull();
        expect(toSearchTerms("  ")).toBeNull();
        expect(toSearchTerms("¿!")).toBeNull();
        expect(toSearchTerms("ch")).toEqual({ normalized: "ch", words: ["ch"] });
    });
});

describe("GET /api/products?q= (HU-T03)", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        invalidateProductCatalogCache();
        loadCatalog();
    });

    it("finds products by name", async () => {
        const response = await search("q=fondant");

        expect(response.status).toBe(200);
        // The fondant product (by name) first; the glass sugar mentions fondant in its description.
        expect(ids(response)).toEqual(["x-fondant", "seed-prod-04"]);
        expect(response.body.total).toBe(2);
    });

    it("finds products by brand", async () => {
        const response = await search("q=molinos");

        expect(ids(response).sort()).toEqual(["seed-prod-01", "seed-prod-02"]);
    });

    it("ignores uppercase and lowercase", async () => {
        const lower = await search("q=fondant");
        const upper = await search("q=FONDANT");
        const mixed = await search("q=FoNdAnT");

        expect(ids(upper)).toEqual(ids(lower));
        expect(ids(mixed)).toEqual(ids(lower));
    });

    it("ignores accents in both directions (jabon finds Jabón)", async () => {
        expect(ids(await search("q=jabon"))).toEqual(["x-jabon"]);
        expect(ids(await search(`q=${encodeURIComponent("JABÓN")}`))).toEqual(["x-jabon"]);
        expect(names(await search(`q=${encodeURIComponent("azucar")}`))).toEqual(
            expect.arrayContaining(["Azúcar glass 500 g", "Cacao en polvo sin azúcar 250 g"])
        );
        expect(ids(await search(`q=${encodeURIComponent("espátula")}`))).toEqual(["seed-prod-13"]);
    });

    it("matches partial words (choco finds Chocolate oscuro)", async () => {
        const response = await search("q=choco");

        expect(names(response)).toEqual(expect.arrayContaining([
            "Chocolate oscuro 70% 200 g",
            "Chocolate semiamargo en barra 500 g",
            "Cobertura de chocolate blanco 1 kg"
        ]));
    });

    it("requires every word, in any order", async () => {
        expect(ids(await search("q=oscuro+choco"))).toEqual(["x-oscuro"]);
        expect(ids(await search("q=chocolate+blanco"))).toEqual(["seed-prod-06"]);
        expect(ids(await search("q=chocolate+inexistente"))).toEqual([]);
    });

    it("also searches the description, ranked after name and brand matches", async () => {
        const response = await search("q=vainilla");

        // The vanilla cake mix and "Esencia de vainilla" match by name (same rank,
        // catalog order); the white chocolate coating only mentions vanilla in its description.
        expect(ids(response)).toEqual(["seed-prod-03", "seed-prod-10", "seed-prod-06"]);
    });

    it("ranks names that start with the search first", async () => {
        const response = await search("q=harina");

        expect(names(response)[0]).toMatch(/^Harina/);
        expect(names(response).slice(0, 2).every((name) => name.startsWith("Harina"))).toBe(true);
    });

    it("returns an empty 200 page when nothing matches", async () => {
        const response = await search("q=xyzzy");

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

    it("ignores very short searches and returns the normal catalog", async () => {
        const all = await search("page=1");

        for (const query of ["q=a", "q=", "q=+", `q=${encodeURIComponent(" ¿ ")}`]) {
            const response = await search(query);
            expect(response.status).toBe(200);
            expect(response.body.total).toBe(all.body.total);
            expect(ids(response)).toEqual(ids(all));
        }
    });

    it("never returns hidden products", async () => {
        const response = await search("q=oculto");
        expect(ids(response)).toEqual([]);

        const brand = await search(`q=${encodeURIComponent("dulce arte")}`);
        expect(ids(brand)).toEqual(["x-fondant"]);

        const withdrawnSeed = await search("q=caja+para+pastel");
        expect(ids(withdrawnSeed)).toEqual([]);
    });

    it("keeps out-of-stock products in the results (they are still public)", async () => {
        const response = await search("q=cacao+en+polvo");

        expect(response.body.items).toEqual([
            expect.objectContaining({ id: "seed-prod-07", available: false })
        ]);
    });

    it("combines with pagination", async () => {
        const products = Array.from({ length: 30 }, (_, index) => ({
            id: `p-${String(index).padStart(2, "0")}`,
            name: `Molde número ${index}`,
            brand: null,
            description: null,
            price: 1000 + index,
            categoryId: "seed-cat-4",
            imageUrl: null,
            available: true,
            status: "published"
        }));
        loadCatalog([...buildSeedData().products, ...products]);

        const first = await search("q=molde&page=1&limit=12");
        const third = await search("q=molde&page=3&limit=12");

        // 30 generated + "Molde redondo desmontable 24 cm" + a chocolate whose
        // description says "moldear" (partial word match)
        expect(first.body).toMatchObject({ total: 32, page: 1, limit: 12, hasMore: true });
        expect(first.body.items).toHaveLength(12);
        expect(third.body).toMatchObject({ total: 32, page: 3, hasMore: false });
        expect(third.body.items).toHaveLength(8);

        const pages = await Promise.all([1, 2, 3].map((page) => search(`q=molde&page=${page}&limit=12`)));
        const allIds = pages.flatMap(ids);
        expect(new Set(allIds).size).toBe(32);
    });

    it("combines with the category filter (HU-T04)", async () => {
        const inCategory = await search("q=chocolate&categoryId=seed-cat-2");
        expect(ids(inCategory).sort()).toEqual(["seed-prod-05", "seed-prod-06", "x-oscuro"]);

        const otherCategory = await search("q=chocolate&categoryId=seed-cat-1");
        expect(ids(otherCategory)).toEqual([]);

        const several = await search("q=500&categoryIds=seed-cat-1&categoryIds=seed-cat-2");
        expect(ids(several).sort()).toEqual(["seed-prod-04", "seed-prod-05"]);
    });

    it("reuses the cached catalog instead of querying Firestore per search", async () => {
        await search("q=choco");
        await search("q=harina");
        await search("q=jabon");

        expect(fake.productRepository.getPublishedProducts).toHaveBeenCalledTimes(1);
    });

    it("works without authentication", async () => {
        const response = await search("q=choco");

        expect(response.status).toBe(200);
        expect(fake.verifyIdToken).not.toHaveBeenCalled();
    });

    it("rejects repeated or bracket q parameters with 400", async () => {
        for (const query of ["q=a&q=b", "q[]=choco", "q[x]=choco"]) {
            const response = await search(query);
            expect(response.status).toBe(400);
            expect(response.body).toEqual({ message: "q must be a single text value." });
        }
        expect(fake.productRepository.getPublishedProducts).not.toHaveBeenCalled();
    });

    it("rejects searches longer than 100 characters with 400", async () => {
        const ok = await search(`q=${"a".repeat(100)}`);
        const tooLong = await search(`q=${"a".repeat(101)}`);

        expect(ok.status).toBe(200);
        expect(tooLong.status).toBe(400);
        expect(tooLong.body).toEqual({ message: "q must not exceed 100 characters." });
    });

    it("answers quickly with 2,000 products", async () => {
        const words = ["Harina", "Chocolate", "Molde", "Colorante", "Esencia", "Fondant", "Caja", "Base", "Jabón", "Azúcar"];
        const products = Array.from({ length: 2000 }, (_, index) => ({
            id: `bulk-${index}`,
            name: `${words[index % words.length]} artesanal número ${index}`,
            brand: `Marca ${index % 37}`,
            description: "Producto de prueba para medir la velocidad del buscador con muchos productos.",
            price: 1000 + index,
            categoryId: `seed-cat-${(index % 5) + 1}`,
            imageUrl: null,
            available: index % 7 !== 0,
            status: "published"
        }));
        loadCatalog(products);
        await search("q=warmup");

        const queries = ["choco", "jabon", "marca 12", "artesanal 1999", "xyz", "azucar"];
        const started = performance.now();
        for (const query of queries) {
            const response = await search(`q=${encodeURIComponent(query)}`);
            expect(response.status).toBe(200);
        }
        const averageMs = (performance.now() - started) / queries.length;

        expect((await search("q=jabon")).body.total).toBe(200);
        // Generous limit so CI machines do not fail by accident; locally it is a few ms.
        expect(averageMs).toBeLessThan(150);
    });

    it("is documented in OpenAPI", () => {
        const doc = YAML.parseDocument(fs.readFileSync(openApiPath, "utf8"));
        expect(doc.errors).toEqual([]);
        const parameter = doc.toJS().paths["/products"].get.parameters.find((p) => p.name === "q");

        expect(parameter).toMatchObject({ in: "query", required: false, schema: { type: "string", maxLength: 100 } });
    });
});
