import { toPublicProduct } from "../models/product.model.js";
import { getCategories } from "../repositories/category.repository.js";
import { getPublishedProducts } from "../repositories/product.repository.js";

export const CATALOG_CACHE_TTL_MS = 60_000;
export const DEFAULT_PAGE_LIMIT = 12;
export const MAX_PAGE_LIMIT = 50;

let cachedCatalog = null;
let cacheExpiresAt = 0;

// Invalidates the in-memory public catalog cache immediately.
export function invalidateProductCatalogCache() {
    cachedCatalog = null;
    cacheExpiresAt = 0;
}

// Retrieves the public product catalog sorted by category order, product name, and id.
// Supports pagination with page and limit (default 12, max 50) and returns hasMore.
// The underlying full catalog is cached in memory for 60 seconds to protect Spark plan limits.
export async function getPublicCatalog({ page = 1, limit = DEFAULT_PAGE_LIMIT } = {}) {
    const now = Date.now();
    let fullCatalog;

    if (cachedCatalog && now < cacheExpiresAt) {
        fullCatalog = cachedCatalog;
    } else {
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
                const nameDiff = a.product.name.localeCompare(b.product.name, "es");
                if (nameDiff !== 0) return nameDiff;
                return a.product.id.localeCompare(b.product.id);
            }
            if (a.category && !b.category) return -1;
            if (!a.category && b.category) return 1;
            const nameDiff = a.product.name.localeCompare(b.product.name, "es");
            if (nameDiff !== 0) return nameDiff;
            return a.product.id.localeCompare(b.product.id);
        });

        fullCatalog = enriched.map(({ product, category }) =>
            toPublicProduct(product, category)
        );

        cachedCatalog = fullCatalog;
        cacheExpiresAt = now + CATALOG_CACHE_TTL_MS;
    }

    const safePage = Number.isInteger(page) && page >= 1 ? page : 1;
    let safeLimit = Number.isInteger(limit) && limit >= 1 ? limit : DEFAULT_PAGE_LIMIT;
    if (safeLimit > MAX_PAGE_LIMIT) {
        safeLimit = MAX_PAGE_LIMIT;
    }

    const total = fullCatalog.length;
    const startIndex = (safePage - 1) * safeLimit;
    const endIndex = startIndex + safeLimit;
    const items = structuredClone(fullCatalog.slice(startIndex, endIndex));
    const hasMore = endIndex < total;

    return {
        items,
        products: items,
        total,
        page: safePage,
        limit: safeLimit,
        hasMore
    };
}
