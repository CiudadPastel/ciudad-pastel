import { apiFetch } from "./api";

export function getAdminProducts() {
    return apiFetch("/admin/products", { requiresAuth: true });
}

export function getAdminProductById(id) {
    return apiFetch(`/admin/products/${encodeURIComponent(id)}`, {
        requiresAuth: true
    });
}

export function getAdminCategories() {
    return apiFetch("/admin/categories", { requiresAuth: true });
}

export function createAdminProduct(product) {
    return apiFetch("/admin/products", {
        method: "POST",
        requiresAuth: true,
        body: JSON.stringify(product)
    });
}
