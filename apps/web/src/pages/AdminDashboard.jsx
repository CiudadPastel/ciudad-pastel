import { useEffect, useState } from "react";
import {
    ArrowRight,
    BookOpen,
    CalendarDays,
    ClipboardList,
    ExternalLink,
    Image,
    Package,
    Plus,
    RefreshCw
} from "lucide-react";
import { Link } from "react-router-dom";

import { useAuth } from "../auth/authContext";
import { COURSE_STATUS } from "../constants/course";
import { getAdminCourses } from "../services/courses.service";
import { getEnrollmentRequests } from "../services/enrollmentRequests.service";
import { getAdminProducts } from "../services/products.service";
import { formatLongDate } from "../utils/schedule";

import styles from "./AdminDashboard.module.css";

const UPCOMING_LIMIT = 4;

// Cada resumen se carga por separado: si uno falla, los demás se muestran igual.
function useSummary(load) {
    const [reloadKey, setReloadKey] = useState(0);
    const [state, setState] = useState({ key: null, status: "loading", data: null });

    useEffect(() => {
        let active = true;
        load()
            .then((data) => {
                if (active) setState({ key: reloadKey, status: "success", data });
            })
            .catch(() => {
                if (active) setState({ key: reloadKey, status: "error", data: null });
            });
        return () => {
            active = false;
        };
    }, [load, reloadKey]);

    return {
        status: state.key === reloadKey ? state.status : "loading",
        data: state.data,
        retry: () => setReloadKey((key) => key + 1)
    };
}

function todayIso() {
    const now = new Date();
    const pad = (value) => String(value).padStart(2, "0");
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function greeting() {
    const hour = new Date().getHours();
    if (hour < 12) return "Buenos días";
    if (hour < 19) return "Buenas tardes";
    return "Buenas noches";
}

const todayLabel = new Intl.DateTimeFormat("es-CR", {
    weekday: "long",
    day: "numeric",
    month: "long"
}).format(new Date());

/** Tarjeta de resumen de una sección, con sus números y un enlace. */
function SectionCard({ icon: Icon, title, to, linkLabel, summary, render }) {
    return (
        <article className={styles.card}>
            <header className={styles.cardHeader}>
                <span className={styles.cardIcon} aria-hidden="true"><Icon size={20} /></span>
                <h2>{title}</h2>
            </header>

            <div className={styles.cardBody} aria-live="polite">
                {summary.status === "loading" && (
                    <div className={styles.skeleton} aria-label={`Cargando ${title.toLowerCase()}`} role="status" />
                )}
                {summary.status === "error" && (
                    <p className={styles.cardError}>
                        No se pudo cargar.
                        <button type="button" onClick={summary.retry} className={styles.retry}>
                            <RefreshCw size={14} aria-hidden="true" />
                            Reintentar
                        </button>
                    </p>
                )}
                {summary.status === "success" && render(summary.data)}
            </div>

            <Link to={to} className={styles.cardLink}>
                {linkLabel}
                <ArrowRight size={16} aria-hidden="true" />
            </Link>
        </article>
    );
}

function Stat({ value, label, highlight = false }) {
    return (
        <p className={`${styles.stat} ${highlight ? styles.statHighlight : ""}`}>
            <strong>{value}</strong>
            <span>{label}</span>
        </p>
    );
}

function AdminDashboard() {
    const { user } = useAuth();
    const courses = useSummary(getAdminCourses);
    const requests = useSummary(getEnrollmentRequests);
    const products = useSummary(getAdminProducts);

    const pendingRequests = requests.status === "success"
        ? requests.data.filter((request) => request.status === "pending").length
        : 0;

    const today = todayIso();
    const upcoming = courses.status === "success"
        ? courses.data
            .filter((course) => course.status === COURSE_STATUS.PUBLISHED && course.schedule?.startDate >= today)
            .sort((a, b) => a.schedule.startDate.localeCompare(b.schedule.startDate))
            .slice(0, UPCOMING_LIMIT)
        : [];

    return (
        <section className={styles.page}>
            <header className={styles.header}>
                <div>
                    <p className={styles.date}>{todayLabel}</p>
                    <h1>{greeting()}</h1>
                    <p className={styles.session}>
                        Sesión iniciada como <strong>{user?.email}</strong>
                    </p>
                </div>
                <a href="/" target="_blank" rel="noopener noreferrer" className="btn btn-secondary">
                    <ExternalLink size={16} aria-hidden="true" />
                    Ver el sitio público
                </a>
            </header>

            {pendingRequests > 0 && (
                <Link to="/admin/solicitudes?estado=pendientes" className={styles.alert}>
                    <ClipboardList size={22} aria-hidden="true" />
                    <span>
                        <strong>
                            {pendingRequests === 1
                                ? "Hay 1 solicitud de matrícula pendiente"
                                : `Hay ${pendingRequests} solicitudes de matrícula pendientes`}
                        </strong>
                        Contacte a las personas para confirmar su matrícula.
                    </span>
                    <ArrowRight size={20} aria-hidden="true" className={styles.alertArrow} />
                </Link>
            )}

            <div className={styles.grid}>
                <SectionCard
                    icon={BookOpen}
                    title="Academia"
                    to="/admin/cursos"
                    linkLabel="Administrar cursos"
                    summary={courses}
                    render={(list) => (
                        <div className={styles.stats}>
                            <Stat value={list.filter((c) => c.status === COURSE_STATUS.PUBLISHED).length} label="publicados" />
                            <Stat value={list.filter((c) => c.status === COURSE_STATUS.DRAFT).length} label="borradores" />
                            <Stat value={list.filter((c) => c.status === COURSE_STATUS.ARCHIVED).length} label="archivados" />
                        </div>
                    )}
                />

                <SectionCard
                    icon={ClipboardList}
                    title="Solicitudes"
                    to="/admin/solicitudes"
                    linkLabel="Ver solicitudes"
                    summary={requests}
                    render={(list) => (
                        <div className={styles.stats}>
                            <Stat value={pendingRequests} label="pendientes" highlight={pendingRequests > 0} />
                            <Stat value={list.filter((r) => r.status === "contacted").length} label="contactadas" />
                            <Stat value={list.filter((r) => r.status === "confirmed").length} label="matriculadas" />
                        </div>
                    )}
                />

                <SectionCard
                    icon={Package}
                    title="Tienda"
                    to="/admin/productos"
                    linkLabel="Administrar productos"
                    summary={products}
                    render={(list) => {
                        const published = list.filter((p) => p.status === "published");
                        return (
                            <div className={styles.stats}>
                                <Stat value={published.length} label="publicados" />
                                <Stat value={published.filter((p) => !p.available).length} label="agotados" />
                                <Stat value={list.length - published.length} label="retirados" />
                            </div>
                        );
                    }}
                />
            </div>

            <div className={styles.columns}>
                <section className={styles.panel} aria-labelledby="upcoming-title">
                    <header className={styles.panelHeader}>
                        <h2 id="upcoming-title">
                            <CalendarDays size={18} aria-hidden="true" />
                            Próximos cursos
                        </h2>
                        <Link to="/admin/cursos?estado=publicados" className={styles.textLink}>Ver todos</Link>
                    </header>

                    {courses.status === "loading" && <div className={styles.skeletonList} role="status" aria-label="Cargando cursos" />}
                    {courses.status === "error" && <p className={styles.muted}>No se pudieron cargar los cursos.</p>}
                    {courses.status === "success" && upcoming.length === 0 && (
                        <p className={styles.muted}>
                            No hay cursos publicados con fecha próxima.{" "}
                            <Link to="/admin/cursos/nuevo" className={styles.textLink}>Crear un curso</Link>
                        </p>
                    )}
                    {upcoming.length > 0 && (
                        <ul className={styles.upcoming}>
                            {upcoming.map((course) => (
                                <li key={course.id}>
                                    <Link to={`/admin/cursos/${encodeURIComponent(course.id)}`} className={styles.upcomingLink}>
                                        <span className={styles.upcomingDate}>{formatLongDate(course.schedule.startDate)}</span>
                                        <span className={styles.upcomingName}>{course.name}</span>
                                        <ArrowRight size={16} aria-hidden="true" />
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    )}
                </section>

                <section className={styles.panel} aria-labelledby="actions-title">
                    <header className={styles.panelHeader}>
                        <h2 id="actions-title">Acciones rápidas</h2>
                    </header>
                    <div className={styles.actions}>
                        <Link to="/admin/cursos/nuevo" className={styles.action}>
                            <Plus size={18} aria-hidden="true" />
                            Nuevo curso
                        </Link>
                        <Link to="/admin/productos/nuevo" className={styles.action}>
                            <Plus size={18} aria-hidden="true" />
                            Nuevo producto
                        </Link>
                        <Link to="/admin/pagina-inicio" className={styles.action}>
                            <Image size={18} aria-hidden="true" />
                            Editar página de inicio
                        </Link>
                        <Link to="/admin/solicitudes?estado=pendientes" className={styles.action}>
                            <ClipboardList size={18} aria-hidden="true" />
                            Solicitudes pendientes
                        </Link>
                    </div>
                </section>
            </div>
        </section>
    );
}

export default AdminDashboard;
