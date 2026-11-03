import { apiFetch } from "./api";

export function getAdminProducts() {
    return apiFetch("/admin/products", { requiresAuth: true });
}

export function getAdminProductById(id) {
    return apiFetch(`/admin/products/${encodeURIComponent(id)}`, {
        requiresAuth: true
    });
}

export function getAdminProductForEdit(id) {
    return apiFetch(`/admin/products/${encodeURIComponent(id)}/edit`, {
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
