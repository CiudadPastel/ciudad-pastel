import { apiFetch } from "./api";

export function getPublicCourses() {
    return apiFetch("/courses");
}

export function getPublicCourseById(id) {
    return apiFetch(`/courses/${encodeURIComponent(id)}`);
}