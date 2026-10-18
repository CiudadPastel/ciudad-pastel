import { apiFetch, ApiError } from "./api";

export function listRecipeBooks(courseId) {
    return apiFetch(`/admin/courses/${encodeURIComponent(courseId)}/recipe-books`, {
        requiresAuth: true
    });
}

export function uploadRecipeBook(courseId, file, title) {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("title", title);

    return apiFetch(`/admin/courses/${encodeURIComponent(courseId)}/recipe-books`, {
        method: "POST",
        requiresAuth: true,
        body: formData
    }).catch((error) => {
        const details = Array.isArray(error.details) ? error.details : [];
        const invalidPdf = details.some((detail) =>
            /file must be a PDF|file must be a valid PDF document/i.test(detail)
        );

        if (invalidPdf) {
            throw new ApiError(
                "El contenido del archivo no es un PDF válido. Seleccione un PDF válido e inténtelo de nuevo.",
                error.status,
                error.details
            );
        }

        throw error;
    });
}

export function getRecipeBookFile(courseId, recipeBookId) {
    return apiFetch(
        `/admin/courses/${encodeURIComponent(courseId)}/recipe-books/${encodeURIComponent(recipeBookId)}/file`,
        { requiresAuth: true, responseType: "blob" }
    );
}

export function deleteRecipeBook(courseId, recipeBookId) {
    return apiFetch(
        `/admin/courses/${encodeURIComponent(courseId)}/recipe-books/${encodeURIComponent(recipeBookId)}`,
        { method: "DELETE", requiresAuth: true }
    );
}