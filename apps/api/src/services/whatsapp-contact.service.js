const DEFAULT_MESSAGE_TEMPLATE = "Hola, quisiera información sobre {{productName}}.";
const MAX_TEMPLATE_LENGTH = 1000;
const INTERNATIONAL_PHONE = /^\+[1-9][0-9]{0,14}$/;

// Read configuration per request; no Firebase access, cached state or substitution.
export function resolveWhatsAppContact() {
    const phone = process.env.WHATSAPP_CONTACT_PHONE?.trim() ?? "";
    if (!phone) return null;

    if (!INTERNATIONAL_PHONE.test(phone)) {
        throw new Error("WhatsApp contact configuration is invalid.");
    }

    // This neutral fallback is provisional until client confirmation under CIU-152.
    const messageTemplate = process.env.WHATSAPP_CONTACT_MESSAGE_TEMPLATE?.trim() || DEFAULT_MESSAGE_TEMPLATE;
    if (!messageTemplate.includes("{{productName}}") || Array.from(messageTemplate).length > MAX_TEMPLATE_LENGTH) {
        throw new Error("WhatsApp contact configuration is invalid.");
    }

    return { phone, messageTemplate };
}
