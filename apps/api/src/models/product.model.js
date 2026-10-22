export const PRODUCT_STATUS = Object.freeze({
    PUBLISHED: "published",
    WITHDRAWN: "withdrawn"
});

// Creates a normalized product entity for persistence.
export function buildProduct(data) {
    return {
        id: data.id,
        name: data.name,
        description: data.description ?? null,
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
        imageUrl: product.imageUrl ?? null,
        available: Boolean(product.available),
        category: category ? { id: category.id, name: category.name } : null
    };
}
