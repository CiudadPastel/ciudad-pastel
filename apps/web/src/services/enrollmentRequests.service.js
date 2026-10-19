import { apiFetch, ApiError } from "./api";
import { ENROLLMENT_STATUS } from "../constants/enrollment";

const USE_MOCKS = import.meta.env.VITE_USE_MOCKS === "true";

/*
 * Solicitudes de matrícula (HU-A05). Endpoints del backend:
 *   POST  /api/courses/:id/enrollment-requests       -> pública (sin sesión)
 *   GET   /api/admin/enrollment-requests             -> lista (admin)
 *   GET   /api/admin/enrollment-requests/:id         -> detalle (admin)
 *   PATCH /api/admin/enrollment-requests/:id/status  -> cambia el estado (admin)
 * Con VITE_USE_MOCKS=true se usan datos en memoria.
 */

// Envía la solicitud de una persona para un curso publicado.
export async function submitEnrollmentRequest(courseId, data) {
    if (USE_MOCKS) return mockSubmit(courseId, data);

    return apiFetch(`/courses/${encodeURIComponent(courseId)}/enrollment-requests`, {
        method: "POST",
        body: JSON.stringify(data)
    });
}

export async function getEnrollmentRequests() {
    if (USE_MOCKS) {
        await wait();
        return structuredClone(mockStore);
    }

    return apiFetch("/admin/enrollment-requests", { requiresAuth: true });
}

export async function updateEnrollmentRequestStatus(id, status) {
    if (USE_MOCKS) {
        await wait();
        const index = mockStore.findIndex((r) => r.id === id);
        if (index === -1) throw new ApiError("Solicitud no encontrada.", 404);
        mockStore[index] = { ...mockStore[index], status, updatedAt: new Date().toISOString() };
        return structuredClone(mockStore[index]);
    }

    return apiFetch(`/admin/enrollment-requests/${encodeURIComponent(id)}/status`, {
        method: "PATCH",
        requiresAuth: true,
        body: JSON.stringify({ status })
    });
}

/* ---------- Solo modo de prueba (VITE_USE_MOCKS=true) ---------- */

const wait = () => new Promise((resolve) => setTimeout(resolve, 500));

let mockStore = [
    {
        id: "e-001",
        courseId: "c-001",
        courseName: "Repostería básica",
        fullName: "Ana Mora Jiménez",
        idType: "national",
        idNumber: "105380021",
        phone: "88887777",
        status: ENROLLMENT_STATUS.PENDING,
        createdAt: "2026-10-18T15:20:00Z",
        updatedAt: "2026-10-18T15:20:00Z"
    },
    {
        id: "e-002",
        courseId: "c-002",
        courseName: "Panadería artesanal",
        fullName: "Luis Ramírez Solano",
        idType: "dimex",
        idNumber: "155123456789",
        phone: "70001234",
        status: ENROLLMENT_STATUS.CONTACTED,
        createdAt: "2026-10-17T19:05:00Z",
        updatedAt: "2026-10-18T10:00:00Z"
    }
];

async function mockSubmit(courseId, data) {
    await wait();
    const repeated = mockStore.some(
        (r) => r.courseId === courseId && r.idNumber === data.idNumber && r.status !== ENROLLMENT_STATUS.DISCARDED
    );
    if (repeated) throw new ApiError("Ya existe una solicitud.", 409);

    const now = new Date().toISOString();
    const created = {
        ...data,
        id: `e-${Date.now()}`,
        courseId,
        courseName: "Curso de prueba",
        status: ENROLLMENT_STATUS.PENDING,
        createdAt: now,
        updatedAt: now
    };
    mockStore = [created, ...mockStore];
    return { id: created.id, courseId, courseName: created.courseName, status: created.status, createdAt: now };
}
