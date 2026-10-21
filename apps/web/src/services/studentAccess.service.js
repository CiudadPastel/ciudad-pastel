import { apiFetch } from "./api";

export function verifyStudentAccess(data) {
    return apiFetch("/student-access/verify", {
        method: "POST",
        body: JSON.stringify(data)
    });
}

export function getStudentRecipeBookFile(courseId, recipeBookId, accessToken) {
    return apiFetch(
        `/student-access/courses/${encodeURIComponent(courseId)}/recipe-books/${encodeURIComponent(recipeBookId)}/file`,
        {
            responseType: "blob",
            headers: { Authorization: `Bearer ${accessToken}` }
        }
    );
}