import { useEffect, useState } from "react";
import {
    LoaderCircle,
    MessageCircle,
    Pencil,
    Phone,
    RotateCcw,
    UserMinus,
    UserPlus,
    Users
} from "lucide-react";

import ConfirmDialog from "../ui/ConfirmDialog";
import Notice from "../ui/Notice";
import { RetryButton } from "../ui/StateMessage";
import EnrollmentFormDialog from "./EnrollmentFormDialog";
import { COURSE_STATUS } from "../../constants/course";
import {
    PAYMENT_STATUS_LABELS,
    STUDENT_STATUS,
    formatPhone,
    idTypeShortLabel,
    whatsappLink
} from "../../constants/enrollment";
import {
    enrollmentErrorMessage,
    getCourseEnrollments,
    paymentStatusErrorMessage,
    registerEnrollment,
    updateEnrollment,
    updateEnrollmentPaymentStatus
} from "../../services/enrollments.service";
import { formatDateTime } from "../../utils/format";

import styles from "./CourseStudents.module.css";

/**
 * Estudiantes matriculados de un curso (HU-A09): cupos, lista, registrar,
 * corregir, cancelar (con confirmación) y reactivar.
 */
function CourseStudents({ course }) {
    const [state, setState] = useState({ status: "loading", enrollments: [], error: null });
    const [reloadKey, setReloadKey] = useState(0);
    const [notice, setNotice] = useState(null);
    // Ventana abierta: { mode: "register" } | { mode: "edit", enrollment }
    const [dialog, setDialog] = useState(null);
    const [cancelling, setCancelling] = useState(null);
    const [busyId, setBusyId] = useState(null);
    const [paymentConfirmation, setPaymentConfirmation] = useState(null);
    const [paymentBusyId, setPaymentBusyId] = useState(null);

    useEffect(() => {
        let active = true;

        getCourseEnrollments(course.id)
            .then((enrollments) => {
                if (active) setState({ status: "success", enrollments, error: null });
            })
            .catch((error) => {
                if (active) setState({ status: "error", enrollments: [], error });
            });

        return () => {
            active = false;
        };
    }, [course.id, reloadKey]);

    // Si se llegó con ".../cursos/:id#estudiantes" (desde Solicitudes), se baja a esta sección
    useEffect(() => {
        if (state.status === "success" && window.location.hash === "#estudiantes") {
            document.getElementById("estudiantes")?.scrollIntoView({ block: "start" });
        }
    }, [state.status]);

    const enrolled = state.enrollments.filter((e) => e.status === STUDENT_STATUS.ENROLLED);
    const cancelled = state.enrollments.filter((e) => e.status === STUDENT_STATUS.CANCELLED);

    const hasCapacity = course.capacity !== null && course.capacity !== undefined;
    const remaining = hasCapacity ? Math.max(0, course.capacity - enrolled.length) : null;
    const isFull = hasCapacity && remaining === 0;
    const archived = course.status === COURSE_STATUS.ARCHIVED;

    function replace(updated) {
        setState((prev) => ({
            ...prev,
            enrollments: prev.enrollments.some((e) => e.id === updated.id)
                ? prev.enrollments.map((e) => (e.id === updated.id ? updated : e))
                : [...prev.enrollments, updated]
        }));
    }

    async function handleRegister(payload) {
        const created = await registerEnrollment(course.id, payload);
        replace(created);
        setDialog(null);
        setNotice({ variant: "success", text: `Se matriculó a ${created.fullName}.` });
    }

    async function handleEdit(enrollment, payload) {
        const updated = await updateEnrollment(enrollment.id, payload);
        replace(updated);
        setDialog(null);
        setNotice({ variant: "success", text: `Se guardaron los cambios de ${updated.fullName}.` });
    }

    async function changeStatus(enrollment, status) {
        setBusyId(enrollment.id);
        setNotice(null);

        try {
            const updated = await updateEnrollment(enrollment.id, { status });
            replace(updated);
            setNotice({
                variant: "success",
                text: status === STUDENT_STATUS.CANCELLED
                    ? `Se canceló la matrícula de ${updated.fullName} y se liberó un cupo.`
                    : `Se volvió a matricular a ${updated.fullName}.`
            });
        } catch (error) {
            setNotice({ variant: "error", text: enrollmentErrorMessage(error) });
        } finally {
            setBusyId(null);
            setCancelling(null);
        }
    }

    function requestPaymentStatusChange(enrollment, paymentStatus) {
        if (paymentStatus === enrollment.paymentStatus || paymentBusyId !== null) return;
        setPaymentConfirmation({ enrollment, paymentStatus });
    }

    async function changePaymentStatus(enrollment, paymentStatus) {
        if (paymentStatus === enrollment.paymentStatus || paymentBusyId !== null) return;

        setPaymentBusyId(enrollment.id);
        setNotice(null);

        try {
            const updated = await updateEnrollmentPaymentStatus(enrollment.id, paymentStatus);
            replace(updated);
            setNotice({ variant: "success", text: "Estado de pago actualizado correctamente" });
        } catch (error) {
            setNotice({ variant: "error", text: paymentStatusErrorMessage(error) });
        } finally {
            setPaymentBusyId(null);
            setPaymentConfirmation(null);
        }
    }

    const registerDisabledReason = archived
        ? "El curso está archivado."
        : isFull ? "No quedan cupos." : null;

    return (
        <section className={styles.section} id="estudiantes" aria-labelledby="students-title">
            <header className={styles.header}>
                <div>
                    <h2 id="students-title">
                        <Users size={18} aria-hidden="true" className={styles.icon} />
                        Estudiantes matriculados
                    </h2>
                    {state.status === "success" && (
                        <p className={styles.spots} aria-live="polite">
                            {hasCapacity ? (
                                <>
                                    <strong>{enrolled.length} de {course.capacity}</strong> cupos ocupados.{" "}
                                    {isFull
                                        ? <span className={styles.full}>Curso lleno.</span>
                                        : `Quedan ${remaining}.`}
                                </>
                            ) : (
                                <>
                                    <strong>{enrolled.length}</strong> matriculados. El curso no tiene cupo definido.
                                </>
                            )}
                        </p>
                    )}
                </div>

                <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => setDialog({ mode: "register" })}
                    disabled={state.status !== "success" || Boolean(registerDisabledReason)}
                    title={registerDisabledReason ?? undefined}
                >
                    <UserPlus size={18} aria-hidden="true" />
                    Registrar estudiante
                </button>
            </header>

            {hasCapacity && state.status === "success" && (
                <div
                    className={styles.meter}
                    role="img"
                    aria-label={`${enrolled.length} de ${course.capacity} cupos ocupados`}
                >
                    <span style={{ width: `${Math.min(100, (enrolled.length / course.capacity) * 100)}%` }} />
                </div>
            )}

            {notice && (
                <Notice variant={notice.variant} onClose={() => setNotice(null)}>
                    {notice.text}
                </Notice>
            )}

            {state.status === "loading" && (
                <p className={styles.muted} role="status">
                    <LoaderCircle size={16} className={styles.spin} aria-hidden="true" /> Cargando estudiantes…
                </p>
            )}

            {state.status === "error" && (
                <div className={styles.error} role="alert">
                    <span>No se pudieron cargar los estudiantes. {state.error?.message}</span>
                    <RetryButton onClick={() => {
                        setState({ status: "loading", enrollments: [], error: null });
                        setReloadKey((key) => key + 1);
                    }} />
                </div>
            )}

            {state.status === "success" && enrolled.length === 0 && (
                <p className={styles.muted}>
                    Todavía no hay estudiantes matriculados. Confirme una solicitud desde
                    "Solicitudes" o use "Registrar estudiante".
                </p>
            )}

            {enrolled.length > 0 && (
                <ul className={styles.list} aria-label="Estudiantes matriculados">
                    {enrolled.map((enrollment) => (
                        <StudentRow
                            key={enrollment.id}
                            enrollment={enrollment}
                            courseName={course.name}
                            busy={busyId === enrollment.id}
                            paymentBusy={paymentBusyId === enrollment.id}
                            paymentDisabled={paymentBusyId !== null || paymentConfirmation !== null}
                            onPaymentStatusChange={requestPaymentStatusChange}
                            actions={(
                                <>
                                    <button
                                        type="button"
                                        className={styles.iconButton}
                                        onClick={() => setDialog({ mode: "edit", enrollment })}
                                        aria-label={`Editar la matrícula de ${enrollment.fullName}`}
                                        title="Editar"
                                    >
                                        <Pencil size={16} aria-hidden="true" />
                                    </button>
                                    <button
                                        type="button"
                                        className={`${styles.iconButton} ${styles.danger}`}
                                        onClick={() => setCancelling(enrollment)}
                                        disabled={busyId !== null}
                                        aria-label={`Cancelar la matrícula de ${enrollment.fullName}`}
                                        title="Cancelar matrícula"
                                    >
                                        <UserMinus size={16} aria-hidden="true" />
                                    </button>
                                </>
                            )}
                        />
                    ))}
                </ul>
            )}

            {cancelled.length > 0 && (
                <details className={styles.cancelled}>
                    <summary>Matrículas canceladas ({cancelled.length})</summary>
                    <ul className={styles.list}>
                        {cancelled.map((enrollment) => (
                            <StudentRow
                                key={enrollment.id}
                                enrollment={enrollment}
                                courseName={course.name}
                                busy={busyId === enrollment.id}
                                paymentBusy={paymentBusyId === enrollment.id}
                                paymentDisabled={paymentBusyId !== null || paymentConfirmation !== null}
                                onPaymentStatusChange={requestPaymentStatusChange}
                                dimmed
                                actions={(
                                    <button
                                        type="button"
                                        className="btn btn-secondary"
                                        onClick={() => changeStatus(enrollment, STUDENT_STATUS.ENROLLED)}
                                        disabled={busyId !== null || isFull || archived}
                                        title={isFull ? "No quedan cupos" : undefined}
                                    >
                                        {busyId === enrollment.id
                                            ? <LoaderCircle size={15} className={styles.spin} aria-hidden="true" />
                                            : <RotateCcw size={15} aria-hidden="true" />}
                                        Volver a matricular
                                    </button>
                                )}
                            />
                        ))}
                    </ul>
                </details>
            )}

            {dialog?.mode === "register" && (
                <EnrollmentFormDialog
                    title="Registrar estudiante"
                    subtitle={`Curso: ${course.name}. Use esta opción cuando ya se confirmó el pago.`}
                    submitLabel="Matricular"
                    submitIcon={UserPlus}
                    onSubmit={handleRegister}
                    onClose={() => setDialog(null)}
                />
            )}

            {dialog?.mode === "edit" && (
                <EnrollmentFormDialog
                    title="Editar matrícula"
                    subtitle={`Curso: ${course.name}`}
                    initialValues={dialog.enrollment}
                    submitLabel="Guardar cambios"
                    onSubmit={(payload) => handleEdit(dialog.enrollment, payload)}
                    onClose={() => setDialog(null)}
                />
            )}

            {cancelling && (
                <ConfirmDialog
                    open
                    title={`¿Cancelar la matrícula de ${cancelling.fullName}?`}
                    confirmLabel="Sí, cancelar matrícula"
                    cancelLabel="No, mantener"
                    confirmIcon={UserMinus}
                    busy={busyId !== null}
                    onConfirm={() => changeStatus(cancelling, STUDENT_STATUS.CANCELLED)}
                    onCancel={() => setCancelling(null)}
                >
                    <p>Se liberará un cupo en el curso. Si fue un error, puede volver a matricular a esta persona después.</p>
                </ConfirmDialog>
            )}

            {paymentConfirmation && (
                <ConfirmDialog
                    open
                    title="¿Actualizar el estado de pago?"
                    confirmLabel={paymentBusyId === paymentConfirmation.enrollment.id ? "Guardando…" : "Actualizar estado"}
                    cancelLabel="Cancelar"
                    busy={paymentBusyId === paymentConfirmation.enrollment.id}
                    onConfirm={() => changePaymentStatus(
                        paymentConfirmation.enrollment,
                        paymentConfirmation.paymentStatus
                    )}
                    onCancel={() => {
                        if (paymentBusyId === null) setPaymentConfirmation(null);
                    }}
                >
                    <p>
                        De <strong>{PAYMENT_STATUS_LABELS[paymentConfirmation.enrollment.paymentStatus]}</strong>
                        {" "}a <strong>{PAYMENT_STATUS_LABELS[paymentConfirmation.paymentStatus]}</strong>.
                    </p>
                    {paymentBusyId === paymentConfirmation.enrollment.id && (
                        <p role="status">
                            <LoaderCircle size={16} className={styles.spin} aria-hidden="true" />
                            {" "}Guardando estado de pago…
                        </p>
                    )}
                </ConfirmDialog>
            )}
        </section>
    );
}

function StudentRow({
    enrollment,
    courseName,
    actions,
    busy,
    paymentBusy,
    paymentDisabled,
    onPaymentStatusChange,
    dimmed = false
}) {
    const message = `Hola ${enrollment.fullName.split(" ")[0]}, le escribimos de Ciudad Pastel: su matrícula en "${courseName}" está confirmada. Le agregaremos al grupo de WhatsApp del curso.`;
    const paymentStatusLabel = PAYMENT_STATUS_LABELS[enrollment.paymentStatus] ?? enrollment.paymentStatus;
    const paymentBadgeClass = {
        pending: styles.paymentBadgePending,
        deposit_paid: styles.paymentBadgeDepositPaid,
        paid: styles.paymentBadgePaid
    }[enrollment.paymentStatus] ?? "";

    return (
        <li
            className={`${styles.row} ${dimmed ? styles.dimmed : ""}`}
            aria-busy={busy || paymentBusy || undefined}
        >
            <div className={styles.person}>
                <span className={styles.name}>{enrollment.fullName}</span>
                <span className={styles.secondary}>
                    {idTypeShortLabel(enrollment.idType)}: {enrollment.idNumber}
                </span>
                {enrollment.note && <span className={styles.note}>{enrollment.note}</span>}
            </div>

            <div className={styles.contact}>
                <span className={styles.phone}>{formatPhone(enrollment.phone)}</span>
                <div className={styles.links}>
                    <a
                        href={whatsappLink(enrollment.phone, message)}
                        target="_blank"
                        rel="noreferrer"
                        className={styles.link}
                        aria-label={`Escribir por WhatsApp a ${enrollment.fullName}`}
                    >
                        <MessageCircle size={15} aria-hidden="true" />
                        WhatsApp
                    </a>
                    <a href={`tel:+506${enrollment.phone}`} className={styles.link} aria-label={`Llamar a ${enrollment.fullName}`}>
                        <Phone size={15} aria-hidden="true" />
                        Llamar
                    </a>
                </div>
            </div>

            <div className={styles.dates}>
                <span>Confirmada: {formatDateTime(enrollment.confirmedAt)}</span>
                {enrollment.cancelledAt && <span>Cancelada: {formatDateTime(enrollment.cancelledAt)}</span>}
                {enrollment.enrollmentRequestId && <span className={styles.fromRequest}>Desde una solicitud</span>}
            </div>

            <div className={styles.payment}>
                <div className={styles.paymentStatus}>
                    <span className={styles.paymentLabel}>Estado de pago</span>
                    <span className={`${styles.paymentBadge} ${paymentBadgeClass}`}>
                        {paymentStatusLabel}
                    </span>
                </div>
                {enrollment.paymentUpdatedAt && (
                    <span className={styles.paymentUpdated}>
                        Actualizado el {formatDateTime(enrollment.paymentUpdatedAt)}
                    </span>
                )}
                <label className={styles.paymentControl}>
                    <span className="sr-only">Cambiar estado de pago de {enrollment.fullName}</span>
                    <select
                        value={enrollment.paymentStatus}
                        onChange={(event) => onPaymentStatusChange(enrollment, event.target.value)}
                        disabled={paymentDisabled}
                        aria-label={`Cambiar estado de pago de ${enrollment.fullName}`}
                    >
                        {Object.entries(PAYMENT_STATUS_LABELS).map(([value, label]) => (
                            <option key={value} value={value}>{label}</option>
                        ))}
                    </select>
                </label>
                {paymentBusy && (
                    <span className={styles.paymentUpdated} role="status">
                        <LoaderCircle size={15} className={styles.spin} aria-hidden="true" />
                        {" "}Guardando…
                    </span>
                )}
            </div>

            <div className={styles.actions}>{actions}</div>
        </li>
    );
}

export default CourseStudents;
