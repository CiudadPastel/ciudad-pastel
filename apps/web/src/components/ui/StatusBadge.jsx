import { Archive, Eye, EyeOff } from "lucide-react";

import { COURSE_STATUS, COURSE_STATUS_LABELS } from "../../constants/course";

import styles from "./StatusBadge.module.css";

const VARIANTS = {
    [COURSE_STATUS.PUBLISHED]: { icon: Eye, className: styles.published },
    [COURSE_STATUS.DRAFT]: { icon: EyeOff, className: styles.unpublished },
    [COURSE_STATUS.ARCHIVED]: { icon: Archive, className: styles.archived }
};

/**
 * Estado de un curso (Publicado, Borrador o Archivado).
 * Usa ícono + texto (no solo color) para que se entienda sin distinguir colores.
 */
function StatusBadge({ status }) {
    const variant = VARIANTS[status] ?? VARIANTS[COURSE_STATUS.DRAFT];
    const Icon = variant.icon;

    return (
        <span className={`${styles.badge} ${variant.className}`}>
            <Icon size={14} aria-hidden="true" />
            {COURSE_STATUS_LABELS[status] ?? status}
        </span>
    );
}

export default StatusBadge;
