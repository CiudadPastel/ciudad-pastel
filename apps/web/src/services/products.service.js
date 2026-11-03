import { apiFetch } from "./api";

export function getAdminProducts() {
    return apiFetch("/admin/products", { requiresAuth: true });
}

export function getAdminProductById(id) {
    return apiFetch(`/admin/products/${encodeURIComponent(id)}`, {
        requiresAuth: true
    });
}
