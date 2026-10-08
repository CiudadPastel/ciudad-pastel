import { CircleAlert, CircleCheck, X } from "lucide-react";

import styles from "./Notice.module.css";

/**
 * Aviso de éxito o error que la persona puede cerrar.
 *   variant: "success" | "error"
 */
function Notice({ variant = "success", children, onClose }) {
    const Icon = variant === "error" ? CircleAlert : CircleCheck;

    return (
        <div
            role={variant === "error" ? "alert" : "status"}
            className={`${styles.notice} ${styles[variant]}`}
        >
            <Icon size={20} aria-hidden="true" />
            <span className={styles.text}>{children}</span>
            {onClose && (
                <button
                    type="button"
                    className={styles.close}
                    onClick={onClose}
                    aria-label="Cerrar aviso"
                    title="Cerrar aviso"
                >
                    <X size={16} aria-hidden="true" />
                </button>
            )}
        </div>
    );
}

export default Notice;
