import { useId } from "react";
import { buildWhatsAppLink } from "../../utils/whatsapp";

// A second explicit link after async validation avoids blocked popup windows.
// Long messages remain complete and selectable; never silently truncate them.
export default function PreparedWhatsAppLink({ contact, message, label, onOpen, className = "btn btn-primary" }) {
    const id = useId();
    const url = buildWhatsAppLink(contact, message);
    if (url) return <a href={url} target="_blank" rel="noopener noreferrer" className={className} onClick={onOpen}>{label}</a>;
    const chat = buildWhatsAppLink(contact);
    if (!chat) return <p role="status">No está disponible el contacto de WhatsApp. Inténtelo de nuevo más tarde.</p>;
    return (
        <div>
            <p role="status">La consulta es demasiado larga para un enlace fiable. Puede reducir la selección o copiar el mensaje completo y pegarlo en el chat.</p>
            <label htmlFor={id}>Mensaje completo para copiar</label>
            <textarea id={id} value={message} readOnly rows={8} style={{ width: "100%" }} onFocus={(event) => event.target.select()} />
            <a href={chat} target="_blank" rel="noopener noreferrer" className={className} onClick={onOpen}>Abrir chat sin mensaje</a>
        </div>
    );
}
