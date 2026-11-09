import { apiFetch } from "./api";

export function getPublicCourses() {
    return apiFetch("/courses");
}

export function getPublicSeasonalCourses() {
    return apiFetch("/courses/seasonal");
}

export function getPublicCourseById(id) {
    return apiFetch(`/courses/${encodeURIComponent(id)}`);
}