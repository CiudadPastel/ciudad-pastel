import { apiFetch } from "./api";
export const DEFAULT_HOME_CONTENT = {
    heroImageUrl: null,
    storeImageUrl: null,
    about: { visible: false, title: "Sobre nosotros", description: "", imageUrl: null }
};

export function getPublicHomeContent() {
    return apiFetch("/site/home", { cache: "no-store" });
}

export function getAdminHomeContent() {
    return apiFetch("/admin/site/home", { requiresAuth: true, cache: "no-store" });
}

export function updateAdminHomeContent(content) {
    return apiFetch("/admin/site/home", { requiresAuth: true, method: "PUT", body: JSON.stringify(content) });
}

export function uploadHomeImage(file) {
    const form = new FormData();
    form.append("file", file);
    return apiFetch("/admin/site/home/image", { requiresAuth: true, method: "POST", body: form });
}
