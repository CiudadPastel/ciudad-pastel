import { toPublicProduct } from "../models/product.model.js";
import { getCategories } from "../repositories/category.repository.js";
import { getPublishedProducts } from "../repositories/product.repository.js";

export const CATALOG_CACHE_TTL_MS = 60_000;
export const DEFAULT_PAGE_LIMIT = 12;
export const MAX_PAGE_LIMIT = 50;

let cachedCatalog = null;
let cacheExpiresAt = 0;
let pendingSnapshot = null;

// Invalidates the in-memory public catalog cache immediately.
export function invalidateProductCatalogCache() {
    cachedCatalog = null;
    cacheExpiresAt = 0;
    // Detach any older load so it cannot repopulate this cache after invalidation.
    pendingSnapshot = null;
}

// Shares one complete published-product/category snapshot across both public endpoints.
async function getCatalogSnapshot() {
    const now = Date.now();

    if (cachedCatalog && now < cacheExpiresAt) {
        return cachedCatalog;
    }
    if (pendingSnapshot) return pendingSnapshot;

    // Concurrent requests share the same pair of repository reads.
    const load = (async () => {
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

        const referencedCategories = new Set(products.map((product) => product.categoryId));
        const snapshot = {
            entries: enriched.map(({ product, category }) => ({
                categoryId: product.categoryId,
                publicProduct: toPublicProduct(product, category)
            })),
            // The category repository owns display order, including Spanish name ties.
            categories: categories
                .filter((category) => referencedCategories.has(category.id))
                .map(({ id, name }) => ({ id, name }))
        };
        if (pendingSnapshot === load) {
            cachedCatalog = snapshot;
            cacheExpiresAt = now + CATALOG_CACHE_TTL_MS;
        }
        return snapshot;
    })();

    pendingSnapshot = load;
    try {
        return await load;
    } finally {
        // A failure is retryable, and older loads must not clear a newer pending load.
        if (pendingSnapshot === load) pendingSnapshot = null;
    }
}

export async function getPublicCategories() {
    const snapshot = await getCatalogSnapshot();
    return structuredClone(snapshot.categories);
}

// Filters the complete cached catalog before calculating totals and pagination.
export async function getPublicCatalog({ page = 1, limit = DEFAULT_PAGE_LIMIT, categoryId } = {}) {
    const snapshot = await getCatalogSnapshot();
    const entries = categoryId === undefined
        ? snapshot.entries
        : snapshot.entries.filter((entry) =>
            entry.categoryId === categoryId && entry.publicProduct.category !== null
        );

    const safePage = Number.isInteger(page) && page >= 1 ? page : 1;
    let safeLimit = Number.isInteger(limit) && limit >= 1 ? limit : DEFAULT_PAGE_LIMIT;
    if (safeLimit > MAX_PAGE_LIMIT) {
        safeLimit = MAX_PAGE_LIMIT;
    }

    const total = entries.length;
    const startIndex = (safePage - 1) * safeLimit;
    const endIndex = startIndex + safeLimit;
    const items = structuredClone(entries.slice(startIndex, endIndex).map((entry) => entry.publicProduct));
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
