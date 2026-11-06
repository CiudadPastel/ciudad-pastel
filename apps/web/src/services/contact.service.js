import { apiFetch } from "./api";
import { isValidContact } from "../utils/whatsapp";
export { buildWhatsAppProductLink, buildWhatsAppLink } from "../utils/whatsapp";

// Share in-flight requests, including explicit retries. Negative results expire.
let pending = null;
let cached = null;
let expiresAt = 0;

export function getWhatsAppContact({ refresh = false } = {}) {
    if (pending) return pending;
    if (!refresh && Date.now() < expiresAt) return Promise.resolve(cached);
    pending = apiFetch("/contact/whatsapp")
        .then(contact => {
            cached = isValidContact(contact) ? contact : null;
            expiresAt = Date.now() + (cached ? 300_000 : 60_000);
            return cached;
        })
        .catch(error => {
            cached = null;
            expiresAt = Date.now() + (error.status === 404 ? 60_000 : 10_000);
            return null;
        })
        .finally(() => { pending = null; });
    return pending;
}

export function resetWhatsAppContactCache() {
    pending = null;
    cached = null;
    expiresAt = 0;
}
