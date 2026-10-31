import { PRODUCT_STATUS, toPublicProduct, toPublicProductDetail } from "../models/product.model.js";
import { getCategories, getCategoryById } from "../repositories/category.repository.js";
import { getProductById, getPublishedProducts } from "../repositories/product.repository.js";
import { normalizeSearchText, toSearchTerms } from "../utils/search-text.js";

// Firestore document IDs used by the store: letters, numbers, "-" and "_".
// Anything else (slashes, very long values) can never match a product.
const PRODUCT_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

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

        const entries = enriched.map(({ product, category }) => ({
            categoryId: product.categoryId,
            publicProduct: toPublicProduct(product, category),
            // In-memory search index (HU-T03): normalized once per snapshot, so
            // each search only compares plain strings.
            search: {
                name: normalizeSearchText(product.name),
                brand: normalizeSearchText(product.brand),
                description: normalizeSearchText(product.description)
            }
        }));
        const categorySummaries = new Map();
        // Reuse sanitized public products in catalog order, independently of pagination.
        for (const { categoryId, publicProduct } of entries) {
            if (!publicProduct.category) continue;
            const summary = categorySummaries.get(categoryId) ?? { productCount: 0, imageUrl: null };
            summary.productCount += 1;
            summary.imageUrl ??= publicProduct.imageUrl;
            categorySummaries.set(categoryId, summary);
        }
        const snapshot = {
            entries,
            // The category repository owns display order, including Spanish name ties.
            categories: categories
                .filter((category) => categorySummaries.has(category.id))
                .map(({ id, name }) => ({ id, name, ...categorySummaries.get(id) }))
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

// Relevance of one entry for the search, or -1 when it does not match.
// Every word must appear (partial words allowed) in the name, brand or description.
// Lower is better: name starts with the search, a name word starts with the
// first word, all words in the name, name + brand, and finally the description.
function searchRank(entry, terms) {
    const { name, brand, description } = entry.search;
    const nameAndBrand = `${name} ${brand}`;
    const everything = `${nameAndBrand} ${description}`;

    if (!terms.words.every((word) => everything.includes(word))) return -1;
    if (name.startsWith(terms.normalized)) return 0;
    if (terms.words.every((word) => name.includes(word))) {
        return ` ${name}`.includes(` ${terms.words[0]}`) ? 1 : 2;
    }
    if (terms.words.every((word) => nameAndBrand.includes(word))) return 3;
    return 4;
}

// Filters the complete cached catalog before calculating totals and pagination.
// Category filter and text search can be combined (HU-T03 + HU-T04).
export async function getPublicCatalog({ page = 1, limit = DEFAULT_PAGE_LIMIT, categoryId, categoryIds, search } = {}) {
    const snapshot = await getCatalogSnapshot();
    const selectedIds = categoryIds === undefined
        ? (categoryId === undefined ? null : new Set([categoryId]))
        : new Set(categoryIds);
    let entries = selectedIds === null
        ? snapshot.entries
        : snapshot.entries.filter((entry) =>
            selectedIds.has(entry.categoryId) && entry.publicProduct.category !== null
        );

    // Searches shorter than 2 characters are ignored (same result as no search).
    const terms = toSearchTerms(search);
    if (terms) {
        entries = entries
            .map((entry) => ({ entry, rank: searchRank(entry, terms) }))
            .filter(({ rank }) => rank >= 0)
            // Array sort is stable: equal ranks keep the catalog order.
            .sort((a, b) => a.rank - b.rank)
            .map(({ entry }) => entry);
    }

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

// Returns the public detail of one product, or null when it does not exist or
// is hidden (not published), so hidden products cannot be opened by direct link.
// Reads Firestore directly instead of the 60 s catalog cache, so a withdrawn
// product stops being visible immediately.
export async function getPublicProductDetail(id) {
    if (typeof id !== "string" || !PRODUCT_ID_PATTERN.test(id)) return null;

    const product = await getProductById(id);
    if (!product || product.status !== PRODUCT_STATUS.PUBLISHED) return null;

    const category = product.categoryId ? await getCategoryById(product.categoryId) : null;
    return toPublicProductDetail(product, category);
}
