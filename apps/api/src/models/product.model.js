import { sanitizeImageUrl } from "../validators/image-url.validator.js";

export const PRODUCT_STATUS = Object.freeze({
    PUBLISHED: "published",
    WITHDRAWN: "withdrawn"
});

// Creates a normalized product entity for persistence.
export function buildProduct(data) {
    return {
        id: data.id,
        name: data.name,
        brand: data.brand ?? null,
        description: data.description ?? null,
        weight: data.weight ?? null,
        size: data.size ?? null,
        price: data.price,
        categoryId: data.categoryId,
        imageUrl: data.imageUrl ?? null,
        available: data.available !== false,
        status: data.status ?? PRODUCT_STATUS.PUBLISHED
    };
}

// Converts a stored product entity into its public representation.
export function toPublicProduct(product, category = null) {
    if (!product) return null;

    return {
        id: product.id,
        name: product.name,
        description: product.description ?? null,
        price: product.price,
        imageUrl: sanitizeImageUrl(product.imageUrl),
        available: Boolean(product.available),
        category: category ? { id: category.id, name: category.name } : null
    };
}

// Full public representation for the product detail page (HU-T02).
// Extends the catalog card fields with brand, weight and size; internal fields
// (status, categoryId, timestamps) are never exposed.
export function toPublicProductDetail(product, category = null) {
    const base = toPublicProduct(product, category);
    if (!base) return null;

    return {
        id: base.id,
        name: base.name,
        brand: product.brand ?? null,
        description: base.description,
        weight: product.weight ?? null,
        size: product.size ?? null,
        price: base.price,
        imageUrl: base.imageUrl,
        available: base.available,
        category: base.category
    };
}

// Converts a stored product entity into its administrative representation (HU-T06).
export function toAdminProduct(product, category = null) {
    if (!product) return null;

    const formatIso = (val) => {
        if (!val) return new Date().toISOString();
        if (val instanceof Date) return val.toISOString();
        if (typeof val?.toDate === "function") return val.toDate().toISOString();
        return String(val);
    };

    return {
        id: product.id,
        name: product.name,
        description: product.description ?? null,
        price: product.price,
        imageUrl: sanitizeImageUrl(product.imageUrl),
        available: Boolean(product.available),
        status: product.status ?? PRODUCT_STATUS.PUBLISHED,
        category: category ? { id: category.id, name: category.name } : null,
        createdAt: formatIso(product.createdAt),
        updatedAt: formatIso(product.updatedAt)
    };
}
