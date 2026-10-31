import { useEffect, useState } from "react";

import { getWhatsAppContact } from "../services/contact.service";

/**
 * Contacto de WhatsApp configurado en el API (HU-T05).
 * Devuelve null mientras carga o si no hay número configurado: en ese caso los
 * botones de WhatsApp no se muestran.
 */
export function useWhatsAppContact() {
    const [contact, setContact] = useState(null);

    useEffect(() => {
        let active = true;
        getWhatsAppContact().then((result) => {
            if (active) setContact(result);
        });
        return () => {
            active = false;
        };
    }, []);

    return contact;
}
