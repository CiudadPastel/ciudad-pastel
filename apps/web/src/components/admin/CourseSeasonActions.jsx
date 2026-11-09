import { useState } from "react";
import { CalendarX, LoaderCircle, Pencil } from "lucide-react";
import { Link } from "react-router-dom";

import ConfirmDialog from "../ui/ConfirmDialog";
import { withdrawSeasonalPublication } from "../../services/courses.service";
import styles from "./CourseSeasonActions.module.css";

function CourseSeasonActions({
    course,
    editTo,
    editState,
    allowEdit = true,
    onChanged,
    onError
}) {
    const [confirming, setConfirming] = useState(false);
    const [pending, setPending] = useState(false);

    if (!course.seasonName) return null;

    async function withdrawSeason() {
        if (pending) return;
        setPending(true);

        try {
            await withdrawSeasonalPublication(course.id);
            setConfirming(false);
            onChanged?.(
                { ...course, seasonName: null },
                `Se retiró "${course.name}" de la temporada ${course.seasonName}.`
            );
        } catch (error) {
            setConfirming(false);
            onError?.(error.message || "No se pudo retirar el curso de la temporada.");
        } finally {
            setPending(false);
        }
    }

    return (
        <div
            className={styles.actions}
            role="group"
            aria-label={`Acciones de temporada para ${course.name}`}
            onClick={(event) => event.stopPropagation()}
        >
            {allowEdit && (
                <Link
                    to={editTo}
                    state={editState}
                    className="btn btn-secondary"
                    onClick={(event) => event.stopPropagation()}
                >
                    <Pencil size={16} aria-hidden="true" />
                    Editar temporada
                </Link>
            )}
            <button
                type="button"
                className={`btn btn-secondary ${styles.withdraw}`}
                onClick={() => setConfirming(true)}
                disabled={pending}
            >
                {pending
                    ? <LoaderCircle size={16} className={styles.spin} aria-hidden="true" />
                    : <CalendarX size={16} aria-hidden="true" />}
                Retirar de temporada
            </button>

            <ConfirmDialog
                open={confirming}
                title={`¿Retirar "${course.name}" de temporada?`}
                confirmLabel={pending ? "Retirando…" : "Retirar de temporada"}
                confirmIcon={CalendarX}
                busy={pending}
                onConfirm={withdrawSeason}
                onCancel={() => {
                    if (!pending) setConfirming(false);
                }}
            >
                <p>
                    ¿Retirar este curso de la temporada <strong>{course.seasonName}</strong>?
                    Dejará de mostrarse en la sección de temporada.
                </p>
            </ConfirmDialog>
        </div>
    );
}

export default CourseSeasonActions;
