import { auth } from "../config/firebase";

const API_URL =
    import.meta.env.VITE_API_URL || "http://localhost:3000/api";

/**
 * Error de la API con el código HTTP, para que las pantallas
 * puedan distinguir "no encontrado" (404) de otros errores.
 */
export class ApiError extends Error {
    constructor(message, status) {
        super(message);
        this.name = "ApiError";
        this.status = status;
    }
}

/**
 * Llama al backend. Con requiresAuth: true agrega el token
 * de Firebase del usuario actual (necesario en rutas /admin).
 */
export async function apiFetch(path, { requiresAuth = false, headers, ...options } = {}) {
    const finalHeaders = {
        "Content-Type": "application/json",
        ...headers
    };

    if (requiresAuth) {
        const user = auth.currentUser;

        if (!user) {
            throw new ApiError("Su sesión expiró. Inicie sesión de nuevo.", 401);
        }

        finalHeaders.Authorization = `Bearer ${await user.getIdToken()}`;
    }

    let response;

    try {
        response = await fetch(`${API_URL}${path}`, {
            ...options,
            headers: finalHeaders
        });
    } catch {
        throw new ApiError(
            "No se pudo conectar con el servidor. Revise su conexión.",
            0
        );
    }

    if (!response.ok) {
        let message = "Ocurrió un error inesperado.";

        try {
            const body = await response.json();
            message = body.message || message;
        } catch {
            // La respuesta no traía JSON; se usa el mensaje genérico
        }

        throw new ApiError(message, response.status);
    }

    return response.status === 204 ? null : response.json();
}
