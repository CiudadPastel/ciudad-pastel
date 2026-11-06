import { useEffect, useId, useRef, useState } from "react";
import { useCart } from "../../cart/useCart";
import PreparedWhatsAppLink from "./PreparedWhatsAppLink";
import { buildIndividualAvailabilityMessage, isValidContact } from "../../utils/whatsapp";
import dialogStyles from "../ui/ConfirmDialog.module.css";
import { buildWhatsAppProductLink } from "../../services/contact.service";

import styles from "./WhatsAppButton.module.css";

/** Logo de WhatsApp (ícono reconocible; lucide no trae marcas). */
function WhatsAppIcon({ size = 18 }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path
                fill="currentColor"
                d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38a9.9 9.9 0 0 0 4.74 1.21c5.46 0 9.91-4.45 9.91-9.91C21.95 6.45 17.5 2 12.04 2Zm0 18.15a8.2 8.2 0 0 1-4.2-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.23 8.23 0 1 1 6.99 3.86Zm4.52-6.16c-.25-.12-1.47-.72-1.7-.81-.22-.08-.39-.12-.55.13-.17.24-.64.8-.78.97-.14.17-.29.19-.54.06-.25-.12-1.05-.39-1.99-1.23-.74-.66-1.23-1.47-1.38-1.72-.14-.25-.02-.38.11-.5.11-.11.25-.29.37-.44.12-.14.17-.25.25-.41.08-.17.04-.31-.02-.44-.06-.12-.55-1.33-.76-1.82-.2-.48-.4-.41-.55-.42h-.47c-.17 0-.43.06-.66.31-.22.25-.86.85-.86 2.07 0 1.22.89 2.4 1.01 2.56.12.17 1.75 2.67 4.23 3.74.59.26 1.05.41 1.41.52.59.19 1.13.16 1.56.1.48-.07 1.47-.6 1.67-1.18.21-.58.21-1.07.14-1.18-.06-.1-.22-.16-.47-.28Z"
            />
        </svg>
    );
}

/**
 * Botón "Consultar por WhatsApp" de un producto (HU-T05).
 * Abre wa.me con el número configurado y un mensaje con el nombre del producto,
 * en una pestaña nueva. Si no hay número configurado (contact = null) no se muestra.
 *   variant: "card" (tarjeta del catálogo), "detail" (página de detalle), "inline"
 */
function WhatsAppButton({ contact, product, productName, variant = "detail", label = "Consultar por WhatsApp" }) {
    if (!isValidContact(contact)) return null;
    if (product) return <ProductInquiry contact={contact} product={product} variant={variant} label={label} />;
    if (!productName || !buildWhatsAppProductLink(contact, productName)) return null;

    return (
        <a
            href={buildWhatsAppProductLink(contact, productName)}
            target="_blank"
            rel="noopener noreferrer"
            className={`${styles.button} ${styles[variant] ?? ""}`}
            aria-label={`${label} sobre ${productName} (se abre en una pestaña nueva)`}
        >
            <WhatsAppIcon size={variant === "card" ? 16 : 20} />
            <span>{label}</span>
        </a>
    );
}

function ProductInquiry({ contact, product, variant, label }) {
    const { add } = useCart();
    const [open, setOpen] = useState(false);
    const [addError, setAddError] = useState("");
    const dialogRef = useRef(null);
    const triggerRef = useRef(null);
    const cancelRef = useRef(null);
    const titleId = useId();
    const descriptionId = useId();
    useEffect(() => {
        if (!open) return;
        const dialog = dialogRef.current;
        const trigger = triggerRef.current;
        dialog.showModal();
        cancelRef.current?.focus();
        return () => { dialog.close(); trigger?.focus({ preventScroll: true }); };
    }, [open]);
    return (
        <>
            <button ref={triggerRef} type="button" className={styles.button + " " + (styles[variant] || "")}
                onClick={() => { setAddError(""); setOpen(true); }} aria-haspopup="dialog" aria-expanded={open} aria-label={label + " sobre " + product.name}>
                <WhatsAppIcon size={variant === "card" ? 16 : 20} /> {label}
            </button>
            <dialog ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId}
                aria-describedby={descriptionId} className={dialogStyles.dialog + " " + styles.inquiryDialog}
                onCancel={(event) => { event.preventDefault(); setOpen(false); }}>
                <h2 id={titleId}>¿Necesitas algún otro producto?</h2>
                <p><strong>{product.name}</strong>{!product.available && " · Aparece como agotado"}</p>
                <p id={descriptionId}>Puedes agregar este producto a tu carrito y seguir explorando, o consultar directamente su disponibilidad por WhatsApp.</p>
                {addError && <p role="alert">{addError}</p>}
                <div className={dialogStyles.actions}>
                    <button type="button" className="btn btn-secondary" onClick={() => {
                        const result = add(product);
                        if (result.success) { setAddError(""); setOpen(false); }
                        else setAddError(result.message);
                    }}>
                        Agregar al carrito y seguir explorando
                    </button>
                    <PreparedWhatsAppLink contact={contact} message={buildIndividualAvailabilityMessage(product)}
                        label="Consultar solo este producto" onOpen={() => setOpen(false)} />
                    <button ref={cancelRef} type="button" className="btn btn-secondary" onClick={() => setOpen(false)}>Cancelar</button>
                </div>
            </dialog>
        </>
    );
}

export default WhatsAppButton;
