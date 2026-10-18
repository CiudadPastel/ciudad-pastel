import { useEffect, useRef } from "react";
import { TriangleAlert } from "lucide-react";

import styles from "./ConfirmDialog.module.css";

/**
 * Ventana de confirmación para acciones importantes (ej. archivar).
 * Usa <dialog> del navegador: bloquea el resto de la página,
 * se cierra con Esc y mantiene el foco dentro.
 *
 *   open, title, children (mensaje)
 *   confirmLabel, cancelLabel, confirmIcon
 *   onConfirm(), onCancel()
 */
function ConfirmDialog({
    open,
    title,
    children,
    confirmLabel = "Confirmar",
    cancelLabel = "Cancelar",
    confirmIcon: ConfirmIcon,
    busy = false,
    onConfirm,
    onCancel
}) {
    const dialogRef = useRef(null);
    const cancelRef = useRef(null);

    useEffect(() => {
        const dialog = dialogRef.current;
        if (!dialog) return;

        if (open && !dialog.open) {
            dialog.showModal();
            // El foco empieza en "Cancelar" para evitar confirmaciones accidentales
            cancelRef.current?.focus();
        } else if (!open && dialog.open) {
            dialog.close();
        }
    }, [open]);

    return (
        <dialog
            ref={dialogRef}
            className={styles.dialog}
            aria-labelledby="confirm-dialog-title"
            aria-describedby="confirm-dialog-message"
            onCancel={(event) => {
                // Tecla Esc
                event.preventDefault();
                onCancel();
            }}
            onClick={(event) => {
                // Clic fuera de la ventana
                if (event.target === dialogRef.current) onCancel();
            }}
        >
            <div className={styles.content}>
                <span className={styles.icon} aria-hidden="true">
                    <TriangleAlert size={24} />
                </span>

                <div className={styles.text}>
                    <h2 id="confirm-dialog-title">{title}</h2>
                    <div id="confirm-dialog-message" className={styles.message}>
                        {children}
                    </div>
                </div>
            </div>

            <div className={styles.actions}>
                <button
                    ref={cancelRef}
                    type="button"
                    className="btn btn-secondary"
                    disabled={busy}
                    onClick={onCancel}
                >
                    {cancelLabel}
                </button>
                <button type="button" className="btn btn-danger" disabled={busy} onClick={onConfirm}>
                    {ConfirmIcon && <ConfirmIcon size={18} aria-hidden="true" />}
                    {confirmLabel}
                </button>
            </div>
        </dialog>
    );
}

export default ConfirmDialog;
