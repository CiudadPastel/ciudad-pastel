import { resolveWhatsAppContact } from "../services/whatsapp-contact.service.js";

export function getWhatsAppContact(req, res) {
    try {
        const contact = resolveWhatsAppContact();
        if (contact === null) {
            return res.status(404).json({ message: "WhatsApp contact is not configured." });
        }
        return res.status(200).json(contact);
    } catch {
        // Never expose or log configuration values or internal exception details.
        return res.status(500).json({ message: "WhatsApp contact configuration is invalid." });
    }
}
