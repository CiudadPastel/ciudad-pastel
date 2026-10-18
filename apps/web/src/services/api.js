import { auth } from "../config/firebase";

const API_URL =
    import.meta.env.VITE_API_URL || "http://localhost:3000/api";

const STATUS_MESSAGES = {
    400: "Algunos datos no son válidos. Revíselos e intente de nuevo.",
    401: "Su sesión expiró. Inicie sesión de nuevo.",
    403: "Su cuenta no tiene permisos para realizar esta acción.",
    404: "No se encontró la información solicitada.",
    409: "Esta acción no es posible en el estado actual.",
    413: "El archivo supera el tamaño máximo permitido de 20 MiB.",
    default: "Ocurrió un error en el servidor. Intente de nuevo en unos minutos."
};

/*
 * Si la API rechaza el token (401) o la cuenta ya no es administradora (403),
 * se avisa a AuthProvider para cerrar la sesión y volver al login.
 */
export const AUTH_EXPIRED_EVENT = "auth:expired";

function notifyAuthProblem(status) {
    window.dispatchEvent(new CustomEvent(AUTH_EXPIRED_EVENT, { detail: { status } }));
}

/**
 * Error de la API con el código HTTP, para que las pantallas
 * puedan distinguir "no encontrado" (404) de otros errores.
 */
export class ApiError extends Error {
    constructor(message, status, details = null) {
        super(message);
        this.name = "ApiError";
        this.status = status;
        // Detalle de validación del backend: lista de textos, ej. ["name must ..."]
        this.details = details;
    }
}

/**
 * Llama al backend. Con requiresAuth: true agrega el token
 * de Firebase del usuario actual (necesario en rutas /admin).
 */
export async function apiFetch(path, {
    requiresAuth = false,
    responseType = "json",
    headers,
    ...options
} = {}) {
    const isFormData = typeof FormData !== "undefined" && options.body instanceof FormData;
    const finalHeaders = {
        ...(!isFormData && { "Content-Type": "application/json" }),
        ...headers
    };

    if (requiresAuth) {
        const user = auth.currentUser;

        if (!user) {
            notifyAuthProblem(401);
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
        let details = null;
        let serverMessage = "";

        try {
            const body = await response.json();
            serverMessage = body.message || "";
            details = body.errors || null;
        } catch {
            // La respuesta no traía JSON
        }

        // El backend responde en inglés: se muestra un mensaje en español
        // y se deja el original en la consola para depurar.
        if (serverMessage) {
            console.warn(`API ${response.status}: ${serverMessage}`, details ?? "");
        }

        if (requiresAuth && (response.status === 401 || response.status === 403)) {
            notifyAuthProblem(response.status);
        }

        throw new ApiError(
            STATUS_MESSAGES[response.status] ?? STATUS_MESSAGES.default,
            response.status,
            details
        );
    }

    if (response.status === 204) return null;
    return responseType === "blob" ? response.blob() : response.json();
}
