import { apiFetch } from "./api";
export const DEFAULT_HOME_CONTENT = {
    heroImageUrl: "https://images.unsplash.com/photo-1578985545062-69928b1d9587?w=1400&q=85",
    storeImageUrl: "https://images.unsplash.com/photo-1499636136210-6f4ee915583e?w=1400&q=85",
    about: { visible: false, title: "Sobre nosotros", description: "", imageUrl: null }
};

export function getPublicHomeContent() {
    return apiFetch("/site/home", { cache: "no-store" });
}

export function getAdminHomeContent() {
    return apiFetch("/admin/site/home", { requiresAuth: true, cache: "no-store" });
}

export function updateAdminHomeContent(content, files = {}) {
    const selected = Object.entries(files).filter(([, file]) => file);
    if (!selected.length) {
        return apiFetch("/admin/site/home", { requiresAuth: true, method: "PUT", body: JSON.stringify(content) });
    }
    const form = new FormData();
    form.append("content", JSON.stringify(content));
    for (const [field, file] of selected) form.append(field, file);
    return apiFetch("/admin/site/home", { requiresAuth: true, method: "PUT", body: form });
}
