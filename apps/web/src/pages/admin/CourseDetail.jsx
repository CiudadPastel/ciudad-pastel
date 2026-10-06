import { useEffect, useState } from "react";
import {
    ArrowLeft,
    Banknote,
    CalendarDays,
    Clock,
    UserRound,
    Users
} from "lucide-react";
import { Link, useLocation, useParams } from "react-router-dom";

import StateMessage, { RetryButton } from "../../components/ui/StateMessage";
import StatusBadge from "../../components/ui/StatusBadge";
import { getAdminCourseById } from "../../services/courses.service";
import { formatDate, formatDateTime, formatPrice } from "../../utils/format";

import styles from "./CourseDetail.module.css";

function CourseDetail() {
    const { id } = useParams();
    const location = useLocation();

    // Vuelve a la lista con el mismo filtro que tenía la persona
    const backTo = location.state?.from || "/admin/cursos";

    const [state, setState] = useState({ id: null, status: "loading", course: null, error: null });
    const [reloadKey, setReloadKey] = useState(0);

    useEffect(() => {
        let active = true;

        getAdminCourseById(id)
            .then((course) => {
                if (active) setState({ id, status: "success", course, error: null });
            })
            .catch((error) => {
                if (active) setState({ id, status: "error", course: null, error });
            });

        return () => {
            active = false;
        };
    }, [id, reloadKey]);

    function retry() {
        setState({ id, status: "loading", course: null, error: null });
        setReloadKey((key) => key + 1);
    }

    // Si cambió el id en la URL, se muestra "cargando" hasta tener el curso nuevo
    const status = state.id === id ? state.status : "loading";

    const backLink = (
        <Link to={backTo} className={styles.back}>
            <ArrowLeft size={16} aria-hidden="true" />
            Volver a cursos
        </Link>
    );

    if (status === "loading") {
        return (
            <section className={styles.page} aria-busy="true">
                {backLink}
                <p className="sr-only" role="status">Cargando curso…</p>
                <div className={styles.card} aria-hidden="true">
                    <span className={styles.skeleton} style={{ width: "45%", height: "1.8rem" }} />
                    <span className={styles.skeleton} style={{ width: "80%" }} />
                    <span className={styles.skeleton} style={{ width: "60%" }} />
                </div>
            </section>
        );
    }

    if (status === "error") {
        const notFound = state.error?.status === 404;

        return (
            <section className={styles.page}>
                {backLink}
                <StateMessage
                    variant="error"
                    title={notFound ? "No encontramos este curso" : "No se pudo cargar el curso"}
                    description={
                        notFound
                            ? "Puede que se haya eliminado o que el enlace esté incorrecto."
                            : state.error?.message
                    }
                    action={
                        notFound ? (
                            <Link to="/admin/cursos" className="btn btn-primary">
                                Ir a la lista de cursos
                            </Link>
                        ) : (
                            <RetryButton onClick={retry} />
                        )
                    }
                />
            </section>
        );
    }

    const { course } = state;
    const available = Math.max(course.capacity - course.enrolledCount, 0);

    return (
        <section className={styles.page}>
            {backLink}

            <article className={styles.card}>
                <header className={styles.header}>
                    <h1>{course.name}</h1>
                    <StatusBadge isPublished={course.isPublished} />
                </header>

                <p className={styles.visibility}>
                    {course.isPublished
                        ? "Este curso se muestra en la oferta pública de la Academia."
                        : "Este curso no es visible para el público."}
                </p>

                {course.description && (
                    <p className={styles.description}>{course.description}</p>
                )}

                <dl className={styles.facts}>
                    <Fact icon={UserRound} label="Instructor" value={course.instructor} />
                    <Fact icon={Clock} label="Horario" value={course.schedule} />
                    <Fact icon={CalendarDays} label="Fecha de inicio" value={formatDate(course.startDate)} />
                    <Fact icon={Banknote} label="Precio" value={formatPrice(course.price)} />
                    <Fact
                        icon={Users}
                        label="Cupo"
                        value={`${course.enrolledCount} de ${course.capacity} matriculados`}
                        hint={available === 0 ? "Sin espacios disponibles" : `${available} espacios disponibles`}
                        warn={available === 0}
                    />
                </dl>

                <footer className={styles.meta}>
                    <span>Creado: {formatDateTime(course.createdAt)}</span>
                    <span>Última modificación: {formatDateTime(course.updatedAt)}</span>
                </footer>
            </article>
        </section>
    );
}

function Fact({ icon: Icon, label, value, hint, warn = false }) {
    return (
        <div className={styles.fact}>
            <Icon size={20} aria-hidden="true" className={styles.factIcon} />
            <div>
                <dt>{label}</dt>
                <dd>{value || "—"}</dd>
                {hint && <dd className={warn ? styles.warn : styles.hint}>{hint}</dd>}
            </div>
        </div>
    );
}

export default CourseDetail;
