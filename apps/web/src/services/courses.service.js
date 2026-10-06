import { apiFetch, ApiError } from "./api";
import { mockCourses } from "../mocks/courses.mock";

const USE_MOCKS = import.meta.env.VITE_USE_MOCKS === "true";

/*
 * Endpoints PROVISIONALES: confirmar con backend.
 *   GET /api/admin/courses       -> lista completa (publicados y no publicados)
 *   GET /api/admin/courses/:id   -> detalle de un curso
 */

export async function getAdminCourses() {
    if (USE_MOCKS) {
        const demo = await simulateNetwork();
        return demo === "vacio" ? [] : structuredClone(mockCourses);
    }

    return apiFetch("/admin/courses", { requiresAuth: true });
}

export async function getAdminCourseById(id) {
    if (USE_MOCKS) {
        await simulateNetwork();
        const course = mockCourses.find((c) => c.id === id);

        if (!course) {
            throw new ApiError("Curso no encontrado.", 404);
        }

        return structuredClone(course);
    }

    return apiFetch(`/admin/courses/${encodeURIComponent(id)}`, {
        requiresAuth: true
    });
}

/*
 * Solo en modo de prueba: agregar ?demo=vacio o ?demo=error a la URL
 * permite revisar los estados vacío y de error sin backend.
 */
async function simulateNetwork() {
    await new Promise((resolve) => setTimeout(resolve, 600));

    const demo = new URLSearchParams(window.location.search).get("demo");

    if (demo === "error") {
        throw new ApiError("No se pudo conectar con el servidor. Revise su conexión.", 0);
    }

    return demo;
}
