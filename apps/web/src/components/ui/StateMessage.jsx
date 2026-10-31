import { CircleAlert, Inbox, RefreshCw } from "lucide-react";

import styles from "./StateMessage.module.css";

/**
 * Mensaje para estados vacíos o de error.
 *   variant: "empty" | "error"
 *   action: botón o enlace opcional (ej. Reintentar, Volver)
 *   icon: ícono opcional de lucide-react (por defecto, según la variante)
 */
function StateMessage({ variant = "empty", title, description, action, icon }) {
    const Icon = icon ?? (variant === "error" ? CircleAlert : Inbox);

    return (
        <div
            className={`${styles.box} ${variant === "error" ? styles.error : ""}`}
            role={variant === "error" ? "alert" : "status"}
        >
            <Icon size={40} strokeWidth={1.5} aria-hidden="true" className={styles.icon} />
            <h2 className={styles.title}>{title}</h2>
            {description && <p className={styles.description}>{description}</p>}
            {action && <div className={styles.action}>{action}</div>}
        </div>
    );
}

export function RetryButton({ onClick }) {
    return (
        <button type="button" className="btn btn-primary" onClick={onClick}>
            <RefreshCw size={16} aria-hidden="true" />
            Reintentar
        </button>
    );
}

export default StateMessage;
