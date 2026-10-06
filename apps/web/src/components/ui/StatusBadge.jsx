import { Eye, EyeOff } from "lucide-react";

import styles from "./StatusBadge.module.css";

/**
 * Estado de publicación de un curso.
 * Usa ícono + texto (no solo color) para que se entienda sin distinguir colores.
 */
function StatusBadge({ isPublished }) {
    const Icon = isPublished ? Eye : EyeOff;

    return (
        <span
            className={`${styles.badge} ${
                isPublished ? styles.published : styles.unpublished
            }`}
        >
            <Icon size={14} aria-hidden="true" />
            {isPublished ? "Publicado" : "No publicado"}
        </span>
    );
}

export default StatusBadge;
