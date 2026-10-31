import { apiFetch } from "./api";

/*
 * Contacto de WhatsApp de Ciudad Pastel (HU-T05, endpoint de CIU-154).
 *   GET /api/contact/whatsapp -> { phone: "+50663785912", messageTemplate: "Hola, ... {{productName}}." }
 *   404 cuando el número no está configurado en el API (WHATSAPP_CONTACT_PHONE).
 */

const PLACEHOLDER = "{{productName}}";
// Todas las tarjetas y el detalle comparten la misma petición. Solo se guarda
// cuando trae un número válido; si no hay número (404) o falla, se vuelve a
// preguntar al entrar a otra página (por si lo configuran sin recargar).
let pending = null;

/** Devuelve { phone, messageTemplate }, o null si no está configurado o no se pudo cargar. */
export function getWhatsAppContact() {
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

function isValidContact(contact) {
    return Boolean(
        contact
        && typeof contact.phone === "string"
        && /^\+[1-9]\d{0,14}$/.test(contact.phone)
        && typeof contact.messageTemplate === "string"
        && contact.messageTemplate.includes(PLACEHOLDER)
    );
}

/** https://wa.me/50663785912?text=Hola%2C%20quisiera%20informaci%C3%B3n%20sobre%20... */
export function buildWhatsAppProductLink(contact, productName) {
    const message = contact.messageTemplate.split(PLACEHOLDER).join(productName);
    return `https://wa.me/${contact.phone.slice(1)}?text=${encodeURIComponent(message)}`;
}

/** Solo para pruebas: olvida la respuesta guardada. */
export function resetWhatsAppContactCache() {
    pending = null;
}
