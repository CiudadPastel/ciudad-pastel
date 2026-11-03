import { apiFetch } from "./api";

export function getAdminProducts() {
    return apiFetch("/admin/products", { requiresAuth: true, cache: "no-store" });
}

export function getAdminProductById(id) {
    return apiFetch(`/admin/products/${encodeURIComponent(id)}`, {
        requiresAuth: true,
        cache: "no-store"
    });
}

export function getAdminProductForEdit(id) {
    return apiFetch(`/admin/products/${encodeURIComponent(id)}/edit`, {
        requiresAuth: true,
        cache: "no-store"
    });
}

export function getAdminCategories() {
    return apiFetch("/admin/categories", { requiresAuth: true, cache: "no-store" });
}

export function createAdminProduct(product) {
    return apiFetch("/admin/products", {
        method: "POST",
        requiresAuth: true,
        body: JSON.stringify(product)
    });
}

export function updateAdminProduct(id, product) {
    return apiFetch(`/admin/products/${encodeURIComponent(id)}`, {
        method: "PUT",
        requiresAuth: true,
        body: JSON.stringify(product)
    });
}

export function removeAdminProduct(id) {
    return apiFetch(`/admin/products/${encodeURIComponent(id)}`, {
        method: "DELETE",
        requiresAuth: true
    });
}
