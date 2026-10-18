import { useEffect, useState } from "react";
import { ArrowRight, ImageOff } from "lucide-react";
import { Link } from "react-router-dom";

import StateMessage, { RetryButton } from "../../components/ui/StateMessage";
import { getPublicCourses } from "../../services/publicCourses.service";
import { formatPrice } from "../../utils/format";
import { formatScheduleRange, formatScheduleSummary } from "../../utils/schedule";

import styles from "./CoursesList.module.css";

function CoursesList() {
    const [reloadKey, setReloadKey] = useState(0);
    const [state, setState] = useState({ key: null, status: "loading", courses: [], error: null });

    useEffect(() => {
        let active = true;

        getPublicCourses()
            .then((courses) => {
                if (active) setState({ key: reloadKey, status: "success", courses, error: null });
            })
            .catch((error) => {
                if (active) setState({ key: reloadKey, status: "error", courses: [], error });
            });

        return () => {
            active = false;
        };
    }, [reloadKey]);

    const status = state.key === reloadKey ? state.status : "loading";

    if (status === "loading") {
        return (
            <section className={styles.page} aria-busy="true">
                <h1>Cursos de repostería</h1>
                <p className={styles.loading} role="status">Cargando cursos…</p>
            </section>
        );
    }

    if (status === "error") {
        return (
            <section className={styles.page}>
                <h1>Cursos de repostería</h1>
                <StateMessage
                    variant="error"
                    title="No se pudieron cargar los cursos"
                    description={state.error?.message}
                    action={<RetryButton onClick={() => setReloadKey((key) => key + 1)} />}
                />
            </section>
        );
    }

    return (
        <section className={styles.page}>
            <header className={styles.heading}>
                <div>
                    <p className={styles.eyebrow}>Ciudad Pastel · Academia</p>
                    <h1>Cursos de repostería</h1>
                    <p className={styles.subtitle}>Encuentra el próximo curso para llevar tus ideas a la mesa.</p>
                </div>
            </header>

            {state.courses.length === 0 ? (
                <StateMessage
                    title="No hay cursos disponibles por el momento"
                    description="Vuelve pronto para conocer las próximas fechas."
                />
            ) : (
                <ul className={styles.grid}>
                    {state.courses.map((course) => (
                        <li key={course.id}>
                            <Link to={`/cursos/${encodeURIComponent(course.id)}`} className={styles.card}>
                                {course.imageUrl ? (
                                    <img
                                        src={course.imageUrl}
                                        alt={`Imagen del curso ${course.name}`}
                                        className={styles.image}
                                    />
                                ) : (
                                    <div className={styles.imageEmpty} aria-hidden="true">
                                        <ImageOff size={28} />
                                    </div>
                                )}
                                <div className={styles.cardBody}>
                                    <h2>{course.name}</h2>
                                    {course.summary && <p className={styles.summary}>{course.summary}</p>}
                                    <div className={styles.cardMeta}>
                                        <strong>
                                            {course.price == null
                                                ? "Precio no disponible"
                                                : course.price === 0 ? "Gratis" : formatPrice(course.price)}
                                        </strong>
                                        {formatScheduleSummary(course.schedule) && (
                                            <span>{formatScheduleSummary(course.schedule)}</span>
                                        )}
                                        {formatScheduleRange(course.schedule) && (
                                            <span>{formatScheduleRange(course.schedule)}</span>
                                        )}
                                    </div>
                                    <span className={styles.cardLink}>
                                        Ver curso
                                        <ArrowRight size={16} aria-hidden="true" />
                                    </span>
                                </div>
                            </Link>
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
}

export default CoursesList;