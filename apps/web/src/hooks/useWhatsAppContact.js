import { useEffect, useState } from "react";

import { getWhatsAppContact } from "../services/contact.service";

/**
 * Contacto de WhatsApp configurado en el API (HU-T05).
 * Devuelve null mientras carga o si no hay número configurado: en ese caso los
 * botones de WhatsApp no se muestran.
 */
export function useWhatsAppContactState() {
    const [reload, setReload] = useState(0);
    const [state, setState] = useState({ key: null, contact: null, status: "loading" });
    useEffect(() => {
        let active = true;
        getWhatsAppContact({ refresh: reload > 0 }).then((contact) => {
            if (active) setState({ key: reload, contact, status: contact ? "success" : "unavailable" });
        });
        return () => { active = false; };
    }, [reload]);
    return { contact: state.key === reload ? state.contact : null,
        status: state.key === reload ? state.status : "loading", retry: () => setReload((key) => key + 1) };
}

export function useWhatsAppContact() {
    return useWhatsAppContactState().contact;
}
