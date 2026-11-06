export const MAX_WHATSAPP_URL_LENGTH = 2000;
const PLACEHOLDER = "{{productName}}";

export function isValidContact(contact) {
    return Boolean(contact && typeof contact.phone === "string" && /^\+[1-9]\d{0,14}$/.test(contact.phone)
        && typeof contact.messageTemplate === "string" && contact.messageTemplate.includes(PLACEHOLDER));
}

export function buildWhatsAppLink(contact, message = "") {
    if (!isValidContact(contact) || typeof message !== "string") return null;
    const url = `https://wa.me/${contact.phone.slice(1)}${message ? `?text=${encodeURIComponent(message.toWellFormed())}` : ""}`;
    return url.length <= MAX_WHATSAPP_URL_LENGTH ? url : null;
}

// Preserve the configured template for generic inquiries (e.g. an empty search).
export function buildWhatsAppProductLink(contact, productName) {
    if (!isValidContact(contact) || typeof productName !== "string") return null;
    return buildWhatsAppLink(contact, contact.messageTemplate.split(PLACEHOLDER).join(productName));
}

export function buildIndividualAvailabilityMessage(product) {
    return `¡Hola, Ciudad Pastel! Me interesa el producto ${product.name} (1 unidad). ¿Podrían confirmarme si está disponible? ¡Muchas gracias!`;
}

export function buildCartAvailabilityMessage(items) {
    if (!items.length) return "";
    const lines = items.map((item) => `- ${item.quantity} × ${item.name.replace(/\s+/g, " ")}`);
    return `¡Hola, Ciudad Pastel!\n\nMe gustaría consultar la disponibilidad de los siguientes productos:\n\n${lines.join("\n")}\n\n¿Podrían confirmarme cuáles tienen disponibles?\n\n¡Muchas gracias!`;
}
