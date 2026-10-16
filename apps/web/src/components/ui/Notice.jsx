import { ArrowRight, CircleAlert, CircleCheck, X } from "lucide-react";
import { Link } from "react-router-dom";

import styles from "./Notice.module.css";

/**
 * Aviso de éxito o error que la persona puede cerrar.
 *   variant: "success" | "error"
 *   action: opcional, { to, label } para un enlace que ayuda a resolver el aviso
 */
function Notice({ variant = "success", children, action, onClose }) {
    const Icon = variant === "error" ? CircleAlert : CircleCheck;

    return (
        <div
            role={variant === "error" ? "alert" : "status"}
            className={`${styles.notice} ${styles[variant]}`}
        >
            <Icon size={20} aria-hidden="true" />
            <span className={styles.text}>
                {children}
                {action && (
                    <Link to={action.to} className={styles.action}>
                        {action.label}
                        <ArrowRight size={14} aria-hidden="true" />
                    </Link>
                )}
            </span>
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
