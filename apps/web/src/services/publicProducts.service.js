import { apiFetch } from "./api";

export function getPublicProducts({ page, limit, search, categoryId } = {}) {
    const params = new URLSearchParams();

    if (page != null) params.set("page", page);
    if (limit != null) params.set("limit", limit);
    if (search) params.set("search", search);
    if (categoryId) params.set("categoryId", categoryId);

    const query = params.toString();
    return apiFetch(`/products${query ? `?${query}` : ""}`);
}
