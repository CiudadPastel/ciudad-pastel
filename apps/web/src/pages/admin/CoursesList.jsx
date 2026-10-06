import { useEffect, useState } from "react";
import { ChevronRight } from "lucide-react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import StateMessage, { RetryButton } from "../../components/ui/StateMessage";
import StatusBadge from "../../components/ui/StatusBadge";
import { getAdminCourses } from "../../services/courses.service";
import { formatDate, formatPrice } from "../../utils/format";

import styles from "./CoursesList.module.css";

const FILTERS = [
    { value: "todos", label: "Todos" },
    { value: "publicados", label: "Publicados" },
    { value: "no-publicados", label: "No publicados" }
];

function matchesFilter(course, filter) {
    if (filter === "publicados") return course.isPublished;
    if (filter === "no-publicados") return !course.isPublished;
    return true;
}

function CoursesList() {
    const [state, setState] = useState({ status: "loading", courses: [], error: null });
    const [reloadKey, setReloadKey] = useState(0);

    // El filtro vive en la URL (?estado=...) para conservarlo al volver del detalle
    const [searchParams, setSearchParams] = useSearchParams();
    const filter = FILTERS.some((f) => f.value === searchParams.get("estado"))
        ? searchParams.get("estado")
        : "todos";

    const navigate = useNavigate();

    useEffect(() => {
        let active = true;

        getAdminCourses()
            .then((courses) => {
                if (active) setState({ status: "success", courses, error: null });
            })
            .catch((error) => {
                if (active) setState({ status: "error", courses: [], error });
            });

        return () => {
            active = false;
        };
    }, [reloadKey]);

    function retry() {
        setState({ status: "loading", courses: [], error: null });
        setReloadKey((key) => key + 1);
    }

    function changeFilter(value) {
        const next = new URLSearchParams(searchParams);
        if (value === "todos") next.delete("estado");
        else next.set("estado", value);
        setSearchParams(next, { replace: true });
    }

    const counts = {
        todos: state.courses.length,
        publicados: state.courses.filter((c) => c.isPublished).length,
        "no-publicados": state.courses.filter((c) => !c.isPublished).length
    };

    const visibleCourses = state.courses.filter((c) => matchesFilter(c, filter));
    const detailState = { from: `/admin/cursos${searchParams.size ? `?${searchParams}` : ""}` };

    return (
        <section className={styles.page}>
            <header className={styles.header}>
                <div>
                    <h1>Cursos</h1>
                    <p className={styles.subtitle}>
                        Todos los cursos registrados de la Academia, publicados o no.
                    </p>
                </div>
            </header>

            <div
                className={styles.filters}
                role="group"
                aria-label="Filtrar por estado de publicación"
            >
                {FILTERS.map(({ value, label }) => (
                    <button
                        key={value}
                        type="button"
                        className={`${styles.filter} ${filter === value ? styles.filterActive : ""}`}
                        aria-pressed={filter === value}
                        onClick={() => changeFilter(value)}
                        disabled={state.status !== "success"}
                    >
                        {label}
                        {state.status === "success" && (
                            <span className={styles.count}>{counts[value]}</span>
                        )}
                    </button>
                ))}
            </div>

            {state.status === "loading" && <LoadingTable />}

            {state.status === "error" && (
                <StateMessage
                    variant="error"
                    title="No se pudieron cargar los cursos"
                    description={state.error?.message}
                    action={<RetryButton onClick={retry} />}
                />
            )}

            {state.status === "success" && state.courses.length === 0 && (
                <StateMessage
                    title="Todavía no hay cursos registrados"
                    description="Cuando se cree el primer curso aparecerá en esta lista."
                />
            )}

            {state.status === "success" &&
                state.courses.length > 0 &&
                visibleCourses.length === 0 && (
                    <StateMessage
                        title={
                            filter === "publicados"
                                ? "No hay cursos publicados"
                                : "No hay cursos sin publicar"
                        }
                        description="Pruebe con otro filtro para ver el resto de los cursos."
                        action={
                            <button
                                type="button"
                                className="btn btn-secondary"
                                onClick={() => changeFilter("todos")}
                            >
                                Ver todos
                            </button>
                        }
                    />
                )}

            {state.status === "success" && visibleCourses.length > 0 && (
                <div className={styles.tableWrap}>
                    <table className={styles.table}>
                        <caption className="sr-only">
                            Lista de cursos de la Academia
                        </caption>
                        <thead>
                            <tr>
                                <th scope="col">Curso</th>
                                <th scope="col">Horario</th>
                                <th scope="col" className={styles.num}>Precio</th>
                                <th scope="col" className={styles.num}>Cupo</th>
                                <th scope="col">Estado</th>
                                <th scope="col"><span className="sr-only">Ver detalle</span></th>
                            </tr>
                        </thead>
                        <tbody>
                            {visibleCourses.map((course) => {
                                const detailUrl = `/admin/cursos/${course.id}`;
                                const isFull = course.enrolledCount >= course.capacity;

                                return (
                                    <tr
                                        key={course.id}
                                        className={styles.row}
                                        onClick={() => navigate(detailUrl, { state: detailState })}
                                    >
                                        <td data-label="Curso">
                                            <div>
                                                <span className={styles.name}>{course.name}</span>
                                                <span className={styles.secondary}>
                                                    {course.instructor}
                                                </span>
                                            </div>
                                        </td>
                                        <td data-label="Horario">
                                            <div>
                                                <span>{course.schedule}</span>
                                                <span className={styles.secondary}>
                                                    Inicia el {formatDate(course.startDate)}
                                                </span>
                                            </div>
                                        </td>
                                        <td data-label="Precio" className={styles.num}>
                                            {formatPrice(course.price)}
                                        </td>
                                        <td data-label="Cupo" className={styles.num}>
                                            <div>
                                                <span className={isFull ? styles.full : ""}>
                                                    {course.enrolledCount}/{course.capacity}
                                                </span>
                                                {isFull && <span className={styles.fullTag}>Lleno</span>}
                                            </div>
                                        </td>
                                        <td data-label="Estado">
                                            <StatusBadge isPublished={course.isPublished} />
                                        </td>
                                        <td className={styles.action}>
                                            <Link
                                                to={detailUrl}
                                                state={detailState}
                                                className={styles.detailLink}
                                                onClick={(e) => e.stopPropagation()}
                                            >
                                                Ver detalle
                                                <ChevronRight size={16} aria-hidden="true" />
                                            </Link>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </section>
    );
}

function LoadingTable() {
    return (
        <div className={styles.tableWrap} aria-busy="true">
            <p className="sr-only" role="status">Cargando cursos…</p>
            {[0, 1, 2, 3].map((i) => (
                <div key={i} className={styles.skeletonRow} aria-hidden="true">
                    <span className={styles.skeleton} style={{ width: "28%" }} />
                    <span className={styles.skeleton} style={{ width: "18%" }} />
                    <span className={styles.skeleton} style={{ width: "22%" }} />
                    <span className={styles.skeleton} style={{ width: "12%" }} />
                </div>
            ))}
        </div>
    );
}

export default CoursesList;
