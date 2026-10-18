import { apiFetch } from "./api";

export function uploadRecipeBook(courseId, file, title) {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("title", title);

    return apiFetch(`/admin/courses/${encodeURIComponent(courseId)}/recipe-books`, {
        method: "POST",
        requiresAuth: true,
        body: formData
    });
}