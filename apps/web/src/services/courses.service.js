import { apiFetch, ApiError } from "./api";
import { COURSE_STATUS, canChangeStatus } from "../constants/course";
import { mockCourses } from "../mocks/courses.mock";

const USE_MOCKS = import.meta.env.VITE_USE_MOCKS === "true";

/*
 * Endpoints del backend (ver apps/api/docs/openapi.yaml o http://localhost:3000/api/docs):
 *   GET  /api/admin/courses       -> lista completa (todos los estados)
 *   GET  /api/admin/courses/:id   -> detalle de un curso
 *   POST /api/admin/courses       -> crea un curso (queda como "draft")
 *   PUT  /api/admin/courses/:id   -> reemplaza la información editable del curso
 *   PATCH /api/admin/courses/:id/status -> cambia el estado ({ status }); 409 si no se permite
 * Con VITE_USE_MOCKS=true se usan datos de prueba en vez del backend.
 */

// La API no garantiza un orden: se muestran primero los modificados recientemente.
function sortByUpdatedAt(courses) {
    return [...courses].sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));
}

// En modo de prueba los cursos viven en memoria: se pierden al recargar la página.
let mockStore = structuredClone(mockCourses);

export async function getAdminCourses() {
    if (USE_MOCKS) {
        const demo = await simulateNetwork();
        return demo === "vacio" ? [] : sortByUpdatedAt(structuredClone(mockStore));
    }

    const courses = await apiFetch("/admin/courses", { requiresAuth: true });
    return sortByUpdatedAt(courses);
}

export async function getAdminCourseById(id) {
    if (USE_MOCKS) {
        await simulateNetwork();
        const course = mockStore.find((c) => c.id === id);

        if (!course) {
            throw new ApiError("Curso no encontrado.", 404);
        }

        return structuredClone(course);
    }

    return apiFetch(`/admin/courses/${encodeURIComponent(id)}`, {
        requiresAuth: true
    });
}

/**
 * Crea un curso. Todo curso nuevo queda como borrador (status "draft");
 * publicarlo es una acción aparte (CIU-26).
 */
export async function createCourse(data) {
    if (USE_MOCKS) {
        await simulateNetwork();

        const now = new Date().toISOString();
        const course = {
            ...data,
            id: `c-${Date.now()}`,
            status: COURSE_STATUS.DRAFT,
            createdAt: now,
            updatedAt: now
        };

        mockStore = [course, ...mockStore];
        return structuredClone(course);
    }

    return apiFetch("/admin/courses", {
        method: "POST",
        requiresAuth: true,
        body: JSON.stringify(data)
    });
}

/**
 * Actualiza la información de un curso (PUT: se envían todos los campos editables).
 * No cambia su estado de publicación (eso es CIU-26).
 */
export async function updateCourse(id, data) {
    if (USE_MOCKS) {
        await simulateNetwork();
        const index = mockStore.findIndex((c) => c.id === id);

        if (index === -1) {
            throw new ApiError("Curso no encontrado.", 404);
        }

        const updated = {
            ...mockStore[index],
            ...data,
            id,
            updatedAt: new Date().toISOString()
        };

        mockStore = mockStore.map((c, i) => (i === index ? updated : c));
        return structuredClone(updated);
    }

    return apiFetch(`/admin/courses/${encodeURIComponent(id)}`, {
        method: "PUT",
        requiresAuth: true,
        body: JSON.stringify(data)
    });
}

/**
 * Cambia el estado de un curso: publicar, pasar a borrador o archivar.
 * Responde con el curso actualizado.
 */
export async function updateCourseStatus(id, status) {
    if (USE_MOCKS) {
        await simulateNetwork();
        const index = mockStore.findIndex((c) => c.id === id);

        if (index === -1) {
            throw new ApiError("Curso no encontrado.", 404);
        }
        if (!canChangeStatus(mockStore[index], status)) {
            throw new ApiError("Esta acción no es posible en el estado actual.", 409);
        }
        // Igual que la API: para publicar solo se exige el precio (puede ser 0)
        if (status === COURSE_STATUS.PUBLISHED && mockStore[index].price == null) {
            throw new ApiError(
                "Algunos datos no son válidos. Revíselos e intente de nuevo.",
                400,
                ["price is required for a published course."]
            );
        }

        const updated = {
            ...mockStore[index],
            status,
            updatedAt: new Date().toISOString()
        };

        mockStore = mockStore.map((c, i) => (i === index ? updated : c));
        return structuredClone(updated);
    }

    return apiFetch(`/admin/courses/${encodeURIComponent(id)}/status`, {
        method: "PATCH",
        requiresAuth: true,
        body: JSON.stringify({ status })
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
