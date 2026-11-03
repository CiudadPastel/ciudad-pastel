import { getAllProducts, getProductById } from "../repositories/product.repository.js";
import { getCategories, getCategoryById } from "../repositories/category.repository.js";
import { toAdminProduct } from "../models/product.model.js";

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
