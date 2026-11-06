import { apiFetch } from "./api";
import { isValidContact } from "../utils/whatsapp";
export { buildWhatsAppProductLink, buildWhatsAppLink } from "../utils/whatsapp";

/*
 * Contacto de WhatsApp de Ciudad Pastel (HU-T05, endpoint de CIU-154).
 *   GET /api/contact/whatsapp -> { phone: "+50663785912", messageTemplate: "Hola, ... {{productName}}." }
 *   404 cuando el número no está configurado en el API (WHATSAPP_CONTACT_PHONE).
 */

// Todas las tarjetas y el detalle comparten la misma petición. Solo se guarda
// cuando trae un número válido; si no hay número (404) o falla, se vuelve a
// preguntar al entrar a otra página (por si lo configuran sin recargar).
let pending = null;

/** Devuelve { phone, messageTemplate }, o null si no está configurado o no se pudo cargar. */
export function getWhatsAppContact({ refresh = false } = {}) {
    if (refresh) pending = null;
    if (!pending) {
        const request = apiFetch("/contact/whatsapp")
            .then((contact) => (isValidContact(contact) ? contact : null))
            .catch(() => null)
            .then((contact) => {
                if (!contact && pending === request) pending = null;
                return contact;
            });
        pending = request;
    }
    return pending;
}

/** Solo para pruebas: olvida la respuesta guardada. */
export function resetWhatsAppContactCache() {
    pending = null;
}
