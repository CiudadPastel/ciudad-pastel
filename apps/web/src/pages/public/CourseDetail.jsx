import { useEffect, useState } from "react";
import { ArrowLeft, ClipboardPen, ImageOff } from "lucide-react";
import { Link, useLocation, useParams } from "react-router-dom";

import EnrollmentRequest from "../../components/public/EnrollmentRequest";
import StateMessage, { RetryButton } from "../../components/ui/StateMessage";
import { getPublicCourseById } from "../../services/publicCourses.service";
import { formatCapacity, formatDate, formatPrice } from "../../utils/format";
import {
    formatLongDate,
    formatScheduleRange,
    formatScheduleSummary
} from "../../utils/schedule";

import styles from "./CourseDetail.module.css";

function CourseDetail() {
    const location = useLocation();
    const from = location.state?.from;
    const backTo = typeof from === "string" && (from === "/cursos" || from.startsWith("/cursos?")) ? from : "/cursos";
    const { id } = useParams();
    const [reloadKey, setReloadKey] = useState(0);
    const [state, setState] = useState({ id: null, key: null, status: "loading", course: null, error: null });
    // Formulario de solicitud de matrícula abierto (HU-A05), por curso
    const [enrollOpenFor, setEnrollOpenFor] = useState(null);

    useEffect(() => {
        let active = true;

        getPublicCourseById(id)
            .then((course) => {
                if (active) setState({ id, key: reloadKey, status: "success", course, error: null });
            })
            .catch((error) => {
                if (active) {
                    setState({
                        id,
                        key: reloadKey,
                        status: error.status === 404 ? "unavailable" : "error",
                        course: null,
                        error
                    });
                }
            });

        return () => {
            active = false;
        };
    }, [id, reloadKey]);

    const status = state.id === id && state.key === reloadKey ? state.status : "loading";

    if (status === "loading") {
        return (
            <section className={styles.page} aria-busy="true">
                <Link to={backTo} state={{ focusCourseId: location.state?.courseId }} className={styles.back}>
                    <ArrowLeft size={16} aria-hidden="true" />
                    Volver a los cursos
                </Link>
                <p className={styles.loading} role="status">Cargando curso…</p>
            </section>
        );
    }

    if (status === "unavailable") {
        return (
            <section className={styles.page}>
                <StateMessage
                    title="Curso no disponible"
                    description="Este curso no se encuentra o ya no está disponible."
                    action={(
                        <Link to={backTo} state={{ focusCourseId: location.state?.courseId }} className="btn btn-primary">
                            <ArrowLeft size={16} aria-hidden="true" />
                            Volver a los cursos
                        </Link>
                    )}
                />
            </section>
        );
    }

    if (status === "error") {
        return (
            <section className={styles.page}>
                <Link to={backTo} state={{ focusCourseId: location.state?.courseId }} className={styles.back}>
                    <ArrowLeft size={16} aria-hidden="true" />
                    Volver a los cursos
                </Link>
                <StateMessage
                    variant="error"
                    title="No se pudo cargar el curso"
                    description={state.error?.message}
                    action={<RetryButton onClick={() => setReloadKey((key) => key + 1)} />}
                />
            </section>
        );
    }

    const { course } = state;
    // Cupos libres (HU-A09). null = el curso no tiene cupo definido
    const isFull = course.remainingSpots === 0;

    return (
        <article className={styles.page}>
            <Link to={backTo} state={{ focusCourseId: location.state?.courseId }} className={styles.back}>
                <ArrowLeft size={16} aria-hidden="true" />
                Volver a los cursos
            </Link>

            <header className={styles.hero}>
                {course.imageUrl ? (
                    <img
                        src={course.imageUrl}
                        alt={`Imagen del curso ${course.name}`}
                        className={styles.image}
                    />
                ) : (
                    <div className={styles.imageEmpty} aria-hidden="true">
                        <ImageOff size={36} />
                    </div>
                )}
                <div className={styles.intro}>
                    <h1>{course.name}</h1>
                    {course.summary && <p className={styles.summary}>{course.summary}</p>}
                    <p className={styles.price}>
                        {course.price == null
                            ? "Precio no disponible"
                            : course.price === 0 ? "Gratis" : formatPrice(course.price)}
                    </p>
                    {course.remainingSpots != null && (
                        <p className={isFull ? styles.spotsFull : styles.spots}>
                            {isFull
                                ? "Cupo lleno"
                                : `Quedan ${course.remainingSpots} ${course.remainingSpots === 1 ? "cupo" : "cupos"}`}
                        </p>
                    )}
                    {!isFull && (
                    <a
                        href="#solicitar-matricula"
                        className="btn btn-primary"
                        onClick={(event) => {
                            event.preventDefault();
                            setEnrollOpenFor(course.id);
                        }}
                    >
                        <ClipboardPen size={18} aria-hidden="true" />
                        Solicitar matrícula
                    </a>
                    )}
                </div>
            </header>

            {course.description && (
                <section className={styles.section}>
                    <h2>Descripción</h2>
                    <p className={styles.prose}>{course.description}</p>
                </section>
            )}

            <section className={styles.section}>
                <h2>Información del curso</h2>
                <dl className={styles.facts}>
                    {course.instructor && (
                        <div>
                            <dt>Instructor</dt>
                            <dd>{course.instructor}</dd>
                        </div>
                    )}
                    {course.capacity != null && (
                        <div>
                            <dt>Cupo</dt>
                            <dd>
                                {formatCapacity(course.capacity)}
                                {course.remainingSpots != null && (
                                    <> ({isFull ? "lleno" : `${course.remainingSpots} disponibles`})</>
                                )}
                            </dd>
                        </div>
                    )}
                    <div className={styles.schedule}>
                        <dt>Fechas y horario</dt>
                        <dd><ScheduleDetails schedule={course.schedule} /></dd>
                    </div>
                </dl>
            </section>

            {course.learningOutcomes?.length > 0 && (
                <PublicList title="¿Qué aprenderás?" items={course.learningOutcomes} />
            )}
            {course.requiredMaterials?.length > 0 && (
                <PublicList title="Materiales que debes traer" items={course.requiredMaterials} />
            )}

            <EnrollmentRequest
                key={course.id}
                course={course}
                open={enrollOpenFor === course.id}
                onOpenChange={(open) => setEnrollOpenFor(open ? course.id : null)}
            />
        </article>
    );
}

function ScheduleDetails({ schedule }) {
    if (!schedule) return <p>Fecha y horario por confirmar.</p>;

    const summary = formatScheduleSummary(schedule);
    const range = formatScheduleRange(schedule);

    return (
        <div className={styles.scheduleDetails}>
            {summary ? <p>{summary}</p> : schedule.startDate && <p>{formatLongDate(schedule.startDate)}</p>}
            {range && <p>{range}</p>}
            {!summary && schedule.endDate && schedule.endDate !== schedule.startDate && (
                <p>Finaliza: {formatDate(schedule.endDate)}</p>
            )}
            {schedule.scheduleNote && <p className={styles.scheduleNote}>{schedule.scheduleNote}</p>}
        </div>
    );
}

function PublicList({ title, items }) {
    return (
        <section className={styles.section}>
            <h2>{title}</h2>
            <ul className={styles.itemList}>
                {items.map((item) => <li key={item}>{item}</li>)}
            </ul>
        </section>
    );
}

export default CourseDetail;