import { apiFetch } from "./api";

/*
 * Matrículas confirmadas (HU-A09). Todas requieren sesión de administración.
 *   GET   /api/admin/courses/:courseId/enrollments       -> estudiantes del curso
 *   POST  /api/admin/courses/:courseId/enrollments       -> matrícula manual
 *   POST  /api/admin/enrollment-requests/:id/confirm     -> desde una solicitud
 *   PATCH /api/admin/enrollments/:id                     -> corregir o cancelar
 */

export function getCourseEnrollments(courseId) {
    return apiFetch(`/admin/courses/${encodeURIComponent(courseId)}/enrollments`, { requiresAuth: true });
}

export function registerEnrollment(courseId, data) {
    return apiFetch(`/admin/courses/${encodeURIComponent(courseId)}/enrollments`, {
        method: "POST",
        requiresAuth: true,
        body: JSON.stringify(data)
    });
}

export function confirmEnrollmentRequest(requestId, data) {
    return apiFetch(`/admin/enrollment-requests/${encodeURIComponent(requestId)}/confirm`, {
        method: "POST",
        requiresAuth: true,
        body: JSON.stringify(data)
    });
}

export function updateEnrollment(id, changes) {
    return apiFetch(`/admin/enrollments/${encodeURIComponent(id)}`, {
        method: "PATCH",
        requiresAuth: true,
        body: JSON.stringify(changes)
    });
}

/** Mensaje en español para los errores de matrícula (409 con código). */
export function enrollmentErrorMessage(error) {
    const messages = {
        COURSE_FULL: "El curso ya no tiene cupos disponibles. Para matricular a alguien más, cancele otra matrícula o aumente el cupo del curso.",
        ALREADY_ENROLLED: "Esta persona ya está matriculada en este curso (misma cédula).",
        COURSE_ARCHIVED: "El curso está archivado y no acepta matrículas. Desarchívelo primero.",
        REQUEST_ALREADY_CONFIRMED: "Esta solicitud ya se confirmó como matrícula.",
        REQUEST_DISCARDED: "Esta solicitud está descartada. Vuélvala a pendiente antes de confirmarla."
    };

    if (error?.code && messages[error.code]) return messages[error.code];
    if (error?.status === 400) return "Revise los datos marcados e intente de nuevo.";
    return error?.message || "No se pudo guardar la matrícula.";
}
