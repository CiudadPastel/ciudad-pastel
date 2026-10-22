import { toPublicProduct } from "../models/product.model.js";
import { getCategories } from "../repositories/category.repository.js";
import { getPublishedProducts } from "../repositories/product.repository.js";

export const CATALOG_CACHE_TTL_MS = 60_000;

let cachedCatalog = null;
let cacheExpiresAt = 0;

// Invalidates the in-memory public catalog cache immediately.
export function invalidateProductCatalogCache() {
    cachedCatalog = null;
    cacheExpiresAt = 0;
}

// Retrieves the public product catalog sorted by category order and product name.
// Results are cached in memory for 60 seconds to protect the Spark plan quota.
export async function getPublicCatalog() {
    const now = Date.now();
    if (cachedCatalog && now < cacheExpiresAt) {
        return structuredClone(cachedCatalog);
    }

    const [products, categories] = await Promise.all([
        getPublishedProducts(),
        getCategories()
    ]);

    const categoryMap = new Map(categories.map((c) => [c.id, c]));

    const enriched = products.map((product) => ({
        product,
        category: categoryMap.get(product.categoryId) ?? null
    }));

    enriched.sort((a, b) => {
        if (a.category && b.category) {
            const orderDiff = a.category.order - b.category.order;
            if (orderDiff !== 0) return orderDiff;
            return a.product.name.localeCompare(b.product.name, "es");
        }
        if (a.category && !b.category) return -1;
        if (!a.category && b.category) return 1;
        return a.product.name.localeCompare(b.product.name, "es");
    });

    const publicCatalog = enriched.map(({ product, category }) =>
        toPublicProduct(product, category)
    );

    cachedCatalog = publicCatalog;
    cacheExpiresAt = now + CATALOG_CACHE_TTL_MS;

    return structuredClone(publicCatalog);
}
