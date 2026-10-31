import { apiFetch } from "./api";

/*
 * Catálogo público de la tienda (sin sesión).
 *   GET /api/products?page&limit&categoryId  -> { items, total, page, limit, hasMore }
 *   GET /api/products/:id                     -> detalle (HU-T02); 404 si no existe o está oculto
 *   GET /api/categories                       -> [{ id, name, productCount, imageUrl }]
 *     (solo categorías con al menos un producto publicado)
 */

export function getPublicProducts({ page, limit, search, categoryId } = {}) {
    const params = new URLSearchParams();
    if (page != null) params.set("page", page);
    if (limit != null) params.set("limit", limit);
    if (search) params.set("search", search);
    if (categoryId) params.set("categoryId", categoryId);
    const query = params.toString();
    return apiFetch(`/products${query ? `?${query}` : ""}`);
}

export async function getPublicCategories() {
    const categories = await apiFetch("/categories");

    if (!Array.isArray(categories)) {
        throw new Error("La lista de categorías no es válida.");
    }

    return categories.filter((category) => category && typeof category.id === "string" && category.name);
}

/** Detalle público de un producto: { id, name, brand, description, weight, size, price, imageUrl, available, category }. */
export function getPublicProduct(id) {
    return apiFetch(`/products/${encodeURIComponent(id)}`);
}
