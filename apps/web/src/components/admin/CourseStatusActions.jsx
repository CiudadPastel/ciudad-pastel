import { useState } from "react";
import { Archive, Eye, EyeOff, LoaderCircle } from "lucide-react";

import ConfirmDialog from "../ui/ConfirmDialog";
import { COURSE_STATUS, canChangeStatus } from "../../constants/course";
import { updateCourseStatus } from "../../services/courses.service";

import styles from "./CourseStatusActions.module.css";

const ACTIONS = [
    {
        target: COURSE_STATUS.PUBLISHED,
        label: "Publicar",
        hint: "Mostrar el curso al público",
        icon: Eye,
        buttonClass: "btn-primary",
        success: (name) => `"${name}" se publicó y ya es visible para el público.`
    },
    {
        target: COURSE_STATUS.DRAFT,
        label: "Despublicar",
        hint: "Ocultar el curso y pasarlo a borrador",
        icon: EyeOff,
        buttonClass: "btn-secondary",
        success: (name) => `"${name}" pasó a borrador y ya no es visible para el público.`
    },
    {
        target: COURSE_STATUS.ARCHIVED,
        label: "Archivar",
        hint: "Retirar el curso definitivamente",
        icon: Archive,
        buttonClass: "btn-secondary",
        danger: true,
        confirm: true,
        success: (name) => `"${name}" se archivó.`
    }
];

/**
 * Botones para cambiar el estado de un curso.
 *   course: curso actual
 *   compact: true en la lista (solo íconos con texto de ayuda)
 *   onChanged(cursoActualizado, mensaje): se llama al terminar bien
 *   onError(mensaje): se llama si la API rechaza el cambio
 */
function CourseStatusActions({ course, compact = false, onChanged, onError }) {
    const [pending, setPending] = useState(null);
    const [confirming, setConfirming] = useState(false);

    const available = ACTIONS.filter((action) => canChangeStatus(course, action.target));

    // Curso archivado: no hay acciones posibles
    if (available.length === 0) return null;

    async function run(action) {
        setConfirming(false);
        setPending(action.target);

        try {
            const updated = await updateCourseStatus(course.id, action.target);
            onChanged?.(updated, action.success(updated.name ?? course.name));
        } catch (error) {
            const message =
                error.status === 409
                    ? "Este curso cambió de estado mientras usted lo veía. Actualice la página e intente de nuevo."
                    : error.message;
            onError?.(message);
        } finally {
            setPending(null);
        }
    }

    function handleClick(event, action) {
        // En la lista, la fila completa es un enlace: evitar que se abra el detalle
        event.stopPropagation();
        if (action.confirm) setConfirming(true);
        else run(action);
    }

    const archiveAction = ACTIONS.find((a) => a.target === COURSE_STATUS.ARCHIVED);
    const isPublishedNow = course.status === COURSE_STATUS.PUBLISHED;

    return (
        <div
            className={compact ? styles.compact : styles.full}
            role="group"
            aria-label={`Acciones de estado para ${course.name}`}
            onClick={(e) => e.stopPropagation()}
        >
            {available.map((action) => {
                const Icon = pending === action.target ? LoaderCircle : action.icon;
                const iconClass = pending === action.target ? styles.spin : undefined;

                return compact ? (
                    <button
                        key={action.target}
                        type="button"
                        className={`${styles.iconButton} ${action.danger ? styles.dangerIcon : ""}`}
                        onClick={(e) => handleClick(e, action)}
                        disabled={pending !== null}
                        aria-label={`${action.label} ${course.name}`}
                        title={`${action.label}: ${action.hint.toLowerCase()}`}
                    >
                        <Icon size={16} aria-hidden="true" className={iconClass} />
                    </button>
                ) : (
                    <button
                        key={action.target}
                        type="button"
                        className={`btn ${action.buttonClass} ${action.danger ? styles.dangerOutline : ""}`}
                        onClick={(e) => handleClick(e, action)}
                        disabled={pending !== null}
                        title={action.hint}
                    >
                        <Icon size={16} aria-hidden="true" className={iconClass} />
                        {pending === action.target ? `${action.label}…` : action.label}
                    </button>
                );
            })}

            {confirming && (
            <ConfirmDialog
                open
                title={`¿Archivar "${course.name}"?`}
                confirmLabel="Sí, archivar"
                confirmIcon={Archive}
                onConfirm={() => run(archiveAction)}
                onCancel={() => setConfirming(false)}
            >
                <p>
                    {isPublishedNow
                        ? "El curso dejará de mostrarse al público de inmediato."
                        : "El curso quedará retirado de la Academia."}
                </p>
                <p>
                    <strong>Esta acción no se puede deshacer:</strong> un curso archivado
                    no se puede volver a publicar ni editar.
                </p>
            </ConfirmDialog>
            )}
        </div>
    );
}

export default CourseStatusActions;
