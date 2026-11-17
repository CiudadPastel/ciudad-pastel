import useAdminList from "../../hooks/useAdminList";
import { matchesSearch, paginateRecords, sortRecords, matchesRequestDates } from "../../utils/adminList";
import { AdminListTools, AdminListPagination, AdminListDate } from "../../components/admin/AdminListTools";
import { useEffect, useState } from "react";
import {
    Ban,
    BadgeCheck,
    CircleCheck,
    Clock,
    LoaderCircle,
    MessageCircle,
    Phone,
    RotateCcw,
    UserCheck
} from "lucide-react";
import { Link } from "react-router-dom";

import EnrollmentFormDialog from "../../components/admin/EnrollmentFormDialog";
import Notice from "../../components/ui/Notice";
import StateMessage, { RetryButton } from "../../components/ui/StateMessage";
import {
    ENROLLMENT_STATUS,
    ENROLLMENT_STATUS_LABELS,
    formatPhone,
    idTypeShortLabel,
    whatsappLink
} from "../../constants/enrollment";
import {
    getEnrollmentRequests,
    updateEnrollmentRequestStatus
} from "../../services/enrollmentRequests.service";
import { confirmEnrollmentRequest } from "../../services/enrollments.service";
import { formatDateTime } from "../../utils/format";

import styles from "./EnrollmentRequests.module.css";

const FILTERS = [
    { value: "todas", label: "Todas" },
    { value: "pendientes", label: "Pendientes", status: ENROLLMENT_STATUS.PENDING },
    { value: "contactadas", label: "Contactadas", status: ENROLLMENT_STATUS.CONTACTED },
    { value: "confirmadas", label: "Confirmadas", status: ENROLLMENT_STATUS.CONFIRMED },
    { value: "descartadas", label: "Descartadas", status: ENROLLMENT_STATUS.DISCARDED }
];

const STATUS_ICONS = {
    [ENROLLMENT_STATUS.PENDING]: Clock,
    [ENROLLMENT_STATUS.CONTACTED]: CircleCheck,
    [ENROLLMENT_STATUS.DISCARDED]: Ban,
    [ENROLLMENT_STATUS.CONFIRMED]: BadgeCheck
};

// Solicitudes que se pueden convertir en matrícula (HU-A09)
const CONFIRMABLE = [ENROLLMENT_STATUS.PENDING, ENROLLMENT_STATUS.CONTACTED];

// Acciones disponibles según el estado actual de la solicitud
const ACTIONS = {
    [ENROLLMENT_STATUS.PENDING]: [
        { to: ENROLLMENT_STATUS.CONTACTED, label: "Marcar contactada", icon: CircleCheck },
        { to: ENROLLMENT_STATUS.DISCARDED, label: "Descartar", icon: Ban }
    ],
    [ENROLLMENT_STATUS.CONTACTED]: [
        { to: ENROLLMENT_STATUS.PENDING, label: "Volver a pendiente", icon: RotateCcw },
        { to: ENROLLMENT_STATUS.DISCARDED, label: "Descartar", icon: Ban }
    ],
    [ENROLLMENT_STATUS.DISCARDED]: [
        { to: ENROLLMENT_STATUS.PENDING, label: "Volver a pendiente", icon: RotateCcw }
    ],
    // Ya es una matrícula: se administra desde el curso
    [ENROLLMENT_STATUS.CONFIRMED]: []
};

const SUCCESS_TEXT = {
    [ENROLLMENT_STATUS.CONTACTED]: "quedó como contactada",
    [ENROLLMENT_STATUS.DISCARDED]: "se descartó",
    [ENROLLMENT_STATUS.PENDING]: "volvió a pendiente"
};

function EnrollmentStatusBadge({ status }) {
    const Icon = STATUS_ICONS[status] ?? Clock;
    return (
        <span className={`${styles.badge} ${styles[status] ?? ""}`}>
            <Icon size={14} aria-hidden="true" />
            {ENROLLMENT_STATUS_LABELS[status] ?? status}
        </span>
    );
}

function EnrollmentRequests() {
    const [state, setState] = useState({ status: "loading", requests: [], error: null });
    const [reloadKey, setReloadKey] = useState(0);
    const [notice, setNotice] = useState(null);
    // Solicitud y acción que se están guardando: { id, to }
    const [pending, setPending] = useState(null);
    // Solicitud que se está confirmando como matrícula (ventana abierta)
    const [confirming, setConfirming] = useState(null);

    // Los filtros viven en la URL: ?estado=pendientes&curso=<id>
    const list = useAdminList();
    const searchParams = list.params;
    const from = searchParams.get("desde") ?? "";
    const to = searchParams.get("hasta") ?? "";
    const returnState = { from: "/admin/solicitudes" + (searchParams.size ? "?" + searchParams : "") };
    const filter = FILTERS.find((f) => f.value === searchParams.get("estado")) ?? FILTERS[0];
    const courseFilter = searchParams.get("curso") ?? "";

    useEffect(() => {
        let active = true;

        getEnrollmentRequests()
            .then((requests) => {
                if (active) setState({ status: "success", requests, error: null });
            })
            .catch((error) => {
                if (active) setState({ status: "error", requests: [], error });
            });

        return () => {
            active = false;
        };
    }, [reloadKey]);

    const setParam = list.setParam;

    async function changeStatus(request, status) {
        setPending({ id: request.id, to: status });
        setNotice(null);

        try {
            const updated = await updateEnrollmentRequestStatus(request.id, status);
            setState((prev) => ({
                ...prev,
                requests: prev.requests.map((r) => (r.id === updated.id ? updated : r))
            }));
            setNotice({ variant: "success", text: `La solicitud de ${request.fullName} ${SUCCESS_TEXT[status]}.` });
        } catch (error) {
            setNotice({ variant: "error", text: error.message });
        } finally {
            setPending(null);
        }
    }

    async function confirmRequest(request, payload) {
        const enrollment = await confirmEnrollmentRequest(request.id, payload);

        setState((prev) => ({
            ...prev,
            requests: prev.requests.map((r) => (
                r.id === request.id
                    ? { ...r, status: ENROLLMENT_STATUS.CONFIRMED, enrollmentId: enrollment.id }
                    : r
            ))
        }));
        setConfirming(null);
        setNotice({
            variant: "success",
            text: `Se matriculó a ${enrollment.fullName} en "${enrollment.courseName}".`,
            action: { to: `/admin/cursos/${enrollment.courseId}#estudiantes`, state: returnState, label: "Ver estudiantes del curso" }
        });
    }

    // Cursos que tienen solicitudes, para el filtro por curso
    const courses = [...new Map(state.requests.map((r) => [r.courseId, r.courseName])).entries()]
        .map(([id, name]) => ({ id, name }))
        .sort((a, b) => a.name.localeCompare(b.name));
    const selectedCourse = courses.find((c) => c.id === courseFilter);

    const ofCourse = state.requests.filter((r) => (!courseFilter || r.courseId === courseFilter)
        && matchesSearch([r.id, r.fullName, r.idNumber, r.phone, r.courseName], list.debounced)
        && matchesRequestDates(r.createdAt, from, to));
    const counts = Object.fromEntries(
        FILTERS.map((f) => [f.value, ofCourse.filter((r) => !f.status || r.status === f.status).length])
    );
    const orders = [["created-desc", "Recibidas más recientes"], ["created-asc", "Recibidas más antiguas"]];
    const order = searchParams.get("orden") === "created-asc" ? "created-asc" : "created-desc";
    const filteredRequests = sortRecords(ofCourse.filter((r) => !filter.status || r.status === filter.status), order);
    const pagination = paginateRecords(filteredRequests, searchParams.get("pagina"));
    const visible = pagination.items;

    return (
        <section className={styles.page}>
            <header>
                <h1>Solicitudes de matrícula</h1>
                <p className={styles.subtitle}>
                    Personas que pidieron matricularse desde la página de un curso. Contáctelas
                    para coordinar el pago y, cuando esté pagado, confirme la matrícula.
                </p>
            </header>

            {notice && (
                <Notice variant={notice.variant} action={notice.action} onClose={() => setNotice(null)}>
                    {notice.text}
                </Notice>
            )}

            <AdminListTools list={list} placeholder="Buscar por nombre, identificación, teléfono o solicitud…" orders={orders} defaultOrder="created-desc" disabled={state.status !== "success"}>
                <AdminListDate label="Desde (Costa Rica)" value={from} max={to || undefined} onChange={(value) => setParam("desde", value)} />
                <AdminListDate label="Hasta (Costa Rica)" value={to} min={from || undefined} onChange={(value) => setParam("hasta", value)} />
            </AdminListTools>
            {from && to && from > to && <p role="alert">La fecha inicial debe ser anterior o igual a la fecha final.</p>}
            <div className={styles.filterBar}>
                <div className={styles.filters} role="group" aria-label="Filtrar por estado">
                    {FILTERS.map((f) => (
                        <button
                            key={f.value}
                            type="button"
                            className={`${styles.filter} ${filter.value === f.value ? styles.filterActive : ""}`}
                            aria-pressed={filter.value === f.value}
                            onClick={() => setParam("estado", f.value === "todas" ? "" : f.value)}
                            disabled={state.status !== "success"}
                        >
                            {f.label}
                            {state.status === "success" && <span className={styles.count}>{counts[f.value]}</span>}
                        </button>
                    ))}
                </div>

                <label className={styles.courseFilter}>
                    <span>Curso</span>
                    <select
                        value={courseFilter}
                        onChange={(event) => setParam("curso", event.target.value)}
                        disabled={state.status !== "success"}
                    >
                        <option value="">Todos los cursos</option>
                        {courses.map((course) => (
                            <option key={course.id} value={course.id}>{course.name}</option>
                        ))}
                        {courseFilter && !selectedCourse && (
                            <option value={courseFilter}>Este curso (sin solicitudes)</option>
                        )}
                    </select>
                </label>
            </div>

            {state.status === "success" && <AdminListPagination total={filteredRequests.length} noun="solicitudes" pagination={pagination} onPage={(page) => setParam("pagina", String(page))} />}
            {state.status === "loading" && (
                <p className={styles.loading} role="status">
                    <LoaderCircle size={18} className={styles.spin} aria-hidden="true" />
                    Cargando solicitudes…
                </p>
            )}

            {state.status === "error" && (
                <StateMessage
                    variant="error"
                    title="No se pudieron cargar las solicitudes"
                    description={state.error?.message}
                    action={<RetryButton onClick={() => {
                        setState({ status: "loading", requests: [], error: null });
                        setReloadKey((key) => key + 1);
                    }} />}
                />
            )}

            {state.status === "success" && visible.length === 0 && (
                <StateMessage
                    title={state.requests.length === 0 ? "Todavía no hay solicitudes" : "No hay solicitudes con estos filtros"}
                    description={
                        state.requests.length === 0
                            ? "Cuando alguien solicite matricularse desde la página de un curso, aparecerá aquí."
                            : "Pruebe con otro estado o curso."
                    }
                    action={state.requests.length > 0 && (
                        <button type="button" className="btn btn-secondary" onClick={list.clear}>
                            Ver todas
                        </button>
                    )}
                />
            )}

            {state.status === "success" && visible.length > 0 && (
                <ul className={styles.list} aria-label="Solicitudes">
                    {visible.map((request) => {
                        const message = `Hola ${request.fullName.split(" ")[0]}, le escribimos de Ciudad Pastel por su solicitud para el curso "${request.courseName}".`;

                        return (
                            <li key={request.id} className={`${styles.item} ${request.status === ENROLLMENT_STATUS.DISCARDED ? styles.dimmed : ""}`}>
                                <div className={styles.person}>
                                    <span className={styles.name}>{request.fullName}</span>
                                    <span className={styles.secondary}>
                                        {idTypeShortLabel(request.idType)}: {request.idNumber}
                                    </span>
                                    <span className={styles.secondary}>
                                        Recibida: {formatDateTime(request.createdAt)}
                                    </span>
                                </div>

                                <div className={styles.contact}>
                                    <span className={styles.phone}>{formatPhone(request.phone)}</span>
                                    <div className={styles.contactLinks}>
                                        <a
                                            href={whatsappLink(request.phone, message)}
                                            target="_blank"
                                            rel="noreferrer"
                                            className={styles.contactLink}
                                            aria-label={`Escribir por WhatsApp a ${request.fullName}`}
                                        >
                                            <MessageCircle size={16} aria-hidden="true" />
                                            WhatsApp
                                        </a>
                                        <a
                                            href={`tel:+506${request.phone}`}
                                            className={styles.contactLink}
                                            aria-label={`Llamar a ${request.fullName}`}
                                        >
                                            <Phone size={16} aria-hidden="true" />
                                            Llamar
                                        </a>
                                    </div>
                                </div>

                                <div className={styles.course}>
                                    <span className={styles.label}>Curso</span>
                                    <Link to={`/admin/cursos/${request.courseId}`} state={returnState}>{request.courseName}</Link>
                                </div>

                                <div className={styles.statusCell}>
                                    <EnrollmentStatusBadge status={request.status} />
                                    {CONFIRMABLE.includes(request.status) && <span className={styles.attention}>Requiere atención</span>}
                                    <div className={styles.actions}>
                                        {CONFIRMABLE.includes(request.status) && (
                                            <button
                                                type="button"
                                                className={`btn btn-primary ${styles.actionButton}`}
                                                onClick={() => setConfirming(request)}
                                                disabled={pending !== null}
                                            >
                                                <UserCheck size={15} aria-hidden="true" />
                                                Confirmar matrícula
                                            </button>
                                        )}
                                        {request.status === ENROLLMENT_STATUS.CONFIRMED && (
                                            <Link
                                                to={`/admin/cursos/${request.courseId}#estudiantes`} state={returnState}
                                                className={styles.confirmedLink}
                                            >
                                                Ver en la lista del curso
                                            </Link>
                                        )}
                                        {(ACTIONS[request.status] ?? []).map((action) => {
                                            const busy = pending?.id === request.id && pending.to === action.to;
                                            const Icon = busy ? LoaderCircle : action.icon;
                                            return (
                                                <button
                                                    key={action.to}
                                                    type="button"
                                                    className={`btn ${action.primary ? "btn-primary" : "btn-secondary"} ${styles.actionButton}`}
                                                    onClick={() => changeStatus(request, action.to)}
                                                    disabled={pending !== null}
                                                >
                                                    <Icon size={15} aria-hidden="true" className={busy ? styles.spin : undefined} />
                                                    {action.label}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            </li>
                        );
                    })}
                </ul>
            )}

            {confirming && (
                <EnrollmentFormDialog
                    title="Confirmar matrícula"
                    subtitle={`Curso: ${confirming.courseName}. Revise los datos antes de confirmar; puede corregirlos.`}
                    initialValues={{
                        fullName: confirming.fullName,
                        idType: confirming.idType,
                        idNumber: confirming.idNumber,
                        phone: confirming.phone
                    }}
                    submitLabel="Confirmar matrícula"
                    submitIcon={UserCheck}
                    onSubmit={(payload) => confirmRequest(confirming, payload)}
                    onClose={() => setConfirming(null)}
                />
            )}
        </section>
    );
}

export default EnrollmentRequests;
