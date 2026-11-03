import { randomUUID } from "node:crypto";
import { getAllProducts, getProductById, upsertProduct } from "../repositories/product.repository.js";
import { getCategories, getCategoryById } from "../repositories/category.repository.js";
import { buildProduct, toAdminProduct, PRODUCT_STATUS } from "../models/product.model.js";
import { validateProductInput } from "../validators/product.validator.js";

function namedError(name, message, details = null, code = null) {
    const error = new Error(message);
    error.name = name;
    if (details) error.details = details;
    if (code) error.code = code;
    return error;
}

/**
 * Retrieves all products for administrative management, joining categories in memory
 * and ordering by last update timestamp in descending order.
 */
export async function listAdminProducts() {
    const [products, categories] = await Promise.all([
        getAllProducts(),
        getCategories()
    ]);

    const categoryMap = new Map(categories.map((c) => [c.id, c]));

    const adminProducts = products.map((product) => {
        const category = product.categoryId ? categoryMap.get(product.categoryId) ?? null : null;
        return toAdminProduct(product, category);
    });

    adminProducts.sort((a, b) => {
        const timeDiff = new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
        return timeDiff !== 0 ? timeDiff : a.name.localeCompare(b.name, "es");
    });

    return adminProducts;
}

/**
 * Retrieves a single product by identifier for administrative management.
 */
export async function getAdminProduct(id) {
    const product = await getProductById(id);
    if (!product) {
        throw namedError("NotFoundError", "Product not found.");
    }

    const category = product.categoryId ? await getCategoryById(product.categoryId) : null;
    return toAdminProduct(product, category);
}

/**
 * Creates a new catalog product with published status and defaults available to true if omitted.
 */
export async function createProduct(input) {
    const validation = validateProductInput(input);
    if (!validation.valid) {
        throw namedError("ValidationError", "Validation failed.", validation.errors);
    }

    const category = await getCategoryById(validation.data.categoryId);
    if (!category) {
        throw namedError("ValidationError", "Validation failed.", ["categoryId must reference an existing category."]);
    }

    const productEntity = buildProduct({
        id: randomUUID(),
        name: validation.data.name,
        brand: validation.data.brand ?? null,
        description: validation.data.description ?? null,
        weight: validation.data.weight ?? null,
        size: validation.data.size ?? null,
        price: validation.data.price,
        categoryId: category.id,
        imageUrl: validation.data.imageUrl ?? null,
        available: validation.data.available !== undefined ? validation.data.available : true,
        status: PRODUCT_STATUS.PUBLISHED
    });

    const saved = await upsertProduct(productEntity);
    return toAdminProduct(saved, category);
}

/**
 * Updates an existing catalog product.
 * Returns 404 when product does not exist, and 409 when the product is withdrawn.
 * Preserves id, status and createdAt; replaces mutable fields; omits available to preserve current value.
 */
export async function updateProduct(id, input) {
    const existing = await getProductById(id);
    if (!existing) {
        throw namedError("NotFoundError", "Product not found.");
    }

    if (existing.status === PRODUCT_STATUS.WITHDRAWN) {
        throw namedError("ConflictError", "Removed products cannot be updated.");
    }

    const validation = validateProductInput(input);
    if (!validation.valid) {
        throw namedError("ValidationError", "Validation failed.", validation.errors);
    }

    const category = await getCategoryById(validation.data.categoryId);
    if (!category) {
        throw namedError("ValidationError", "Validation failed.", ["categoryId must reference an existing category."]);
    }

    const updatedEntity = buildProduct({
        id: existing.id,
        name: validation.data.name,
        brand: validation.data.brand ?? null,
        description: validation.data.description ?? null,
        weight: validation.data.weight ?? null,
        size: validation.data.size ?? null,
        price: validation.data.price,
        categoryId: category.id,
        imageUrl: validation.data.imageUrl ?? null,
        available: validation.data.available !== undefined ? validation.data.available : existing.available,
        status: existing.status
    });

    const saved = await upsertProduct(updatedEntity);
    return toAdminProduct(saved, category);
}

/**
 * Soft-deletes a catalog product by setting its status to withdrawn.
 * Idempotent: if the product is already withdrawn, returns without error.
 * Returns 404 if the product does not exist.
 */
export async function removeProduct(id) {
    const existing = await getProductById(id);
    if (!existing) {
        throw namedError("NotFoundError", "Product not found.");
    }

    if (existing.status === PRODUCT_STATUS.WITHDRAWN) {
        return;
    }

    const updatedEntity = buildProduct({
        ...existing,
        status: PRODUCT_STATUS.WITHDRAWN
    });

    await upsertProduct(updatedEntity);
}

/**
 * Retrieves all categories formatted for administrative form selection.
 */
export async function listAdminCategories() {
    const categories = await getCategories();
    return categories.map((cat) => ({
        id: cat.id,
        name: cat.name,
        order: cat.order
    }));
}
