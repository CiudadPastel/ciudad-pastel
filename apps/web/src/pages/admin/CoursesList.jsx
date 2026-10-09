import { useEffect, useState } from "react";
import { ChevronRight, ImageOff, Pencil, Plus } from "lucide-react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import CourseStatusActions from "../../components/admin/CourseStatusActions";
import Notice from "../../components/ui/Notice";
import StateMessage, { RetryButton } from "../../components/ui/StateMessage";
import StatusBadge from "../../components/ui/StatusBadge";
import { getAdminCourses } from "../../services/courses.service";
import { COURSE_STATUS, canEditCourse } from "../../constants/course";
import { formatDateTime } from "../../utils/format";

import styles from "./CoursesList.module.css";

const FILTERS = [
    { value: "todos", label: "Todos" },
    { value: "publicados", label: "Publicados" },
    { value: "borradores", label: "Borradores" },
    { value: "archivados", label: "Archivados" }
];

// Valor del filtro en la URL -> estado del curso en la API
const FILTER_STATUS = {
    publicados: COURSE_STATUS.PUBLISHED,
    borradores: COURSE_STATUS.DRAFT,
    archivados: COURSE_STATUS.ARCHIVED
};

const EMPTY_FILTER_TITLES = {
    publicados: "No hay cursos publicados",
    borradores: "No hay cursos en borrador",
    archivados: "No hay cursos archivados"
};

function matchesFilter(course, filter) {
    return filter === "todos" || course.status === FILTER_STATUS[filter];
}

function CoursesList() {
    const [state, setState] = useState({ status: "loading", courses: [], error: null });
    const [reloadKey, setReloadKey] = useState(0);
    // Aviso después de publicar, pasar a borrador o archivar
    const [notice, setNotice] = useState(null);

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

    function handleStatusChanged(updated, message) {
        setState((prev) => ({
            ...prev,
            courses: prev.courses.map((c) => (c.id === updated.id ? updated : c))
        }));
        setNotice({ variant: "success", text: message });
    }

    function handleStatusError(message) {
        setNotice({ variant: "error", text: message });
    }

    function changeFilter(value) {
        const next = new URLSearchParams(searchParams);
        if (value === "todos") next.delete("estado");
        else next.set("estado", value);
        setSearchParams(next, { replace: true });
    }

    const counts = {
        todos: state.courses.length,
        publicados: state.courses.filter((c) => matchesFilter(c, "publicados")).length,
        borradores: state.courses.filter((c) => matchesFilter(c, "borradores")).length,
        archivados: state.courses.filter((c) => matchesFilter(c, "archivados")).length
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

                <Link to="/admin/cursos/nuevo" className="btn btn-primary">
                    <Plus size={18} aria-hidden="true" />
                    Nuevo curso
                </Link>
            </header>

            {notice && (
                <Notice variant={notice.variant} onClose={() => setNotice(null)}>
                    {notice.text}
                </Notice>
            )}

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
                    action={
                        <Link to="/admin/cursos/nuevo" className="btn btn-primary">
                            <Plus size={18} aria-hidden="true" />
                            Crear el primer curso
                        </Link>
                    }
                />
            )}

            {state.status === "success" &&
                state.courses.length > 0 &&
                visibleCourses.length === 0 && (
                    <StateMessage
                        title={EMPTY_FILTER_TITLES[filter]}
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
                                <th scope="col">Estado</th>
                                <th scope="col">Última modificación</th>
                                <th scope="col"><span className="sr-only">Acciones</span></th>
                            </tr>
                        </thead>
                        <tbody>
                            {visibleCourses.map((course) => {
                                const detailUrl = `/admin/cursos/${course.id}`;
                                return (
                                    <tr
                                        key={course.id}
                                        className={styles.row}
                                        onClick={() => navigate(detailUrl, { state: detailState })}
                                    >
                                        <td data-label="Curso">
                                            <div className={styles.courseCell}>
                                                <CourseThumb course={course} />
                                                <div>
                                                    <span className={styles.name}>{course.name}</span>
                                                    <span className={styles.secondary}>
                                                        {course.summary}
                                                    </span>
                                                    <span className={styles.meta}>
                                                        {countLabel(course.learningOutcomes, "aprendizaje", "aprendizajes")}
                                                        {" · "}
                                                        {countLabel(course.requiredMaterials, "material", "materiales")}
                                                    </span>
                                                </div>
                                            </div>
                                        </td>
                                        <td data-label="Estado">
                                            <StatusBadge status={course.status} />
                                        </td>
                                        <td data-label="Modificado" className={styles.date}>
                                            {formatDateTime(course.updatedAt)}
                                        </td>
                                        <td className={styles.action}>
                                            <CourseStatusActions
                                                course={course}
                                                compact
                                                onChanged={handleStatusChanged}
                                                onError={handleStatusError}
                                            />
                                            {canEditCourse(course) && (
                                                <Link
                                                    to={`${detailUrl}/editar`}
                                                    state={detailState}
                                                    className={styles.editLink}
                                                    onClick={(e) => e.stopPropagation()}
                                                    aria-label={`Editar ${course.name}`}
                                                    title="Editar"
                                                >
                                                    <Pencil size={16} aria-hidden="true" />
                                                </Link>
                                            )}
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

function countLabel(items = [], singular, plural) {
    const n = items.length;
    if (n === 0) return `Sin ${plural}`;
    return `${n} ${n === 1 ? singular : plural}`;
}

function CourseThumb({ course }) {
    const [broken, setBroken] = useState(false);

    if (!course.imageUrl || broken) {
        return (
            <span className={styles.thumbEmpty} aria-hidden="true">
                <ImageOff size={18} />
            </span>
        );
    }

    return (
        <img
            src={course.imageUrl}
            alt=""
            className={styles.thumb}
            onError={() => setBroken(true)}
        />
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
