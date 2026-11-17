import useAdminList from "../../hooks/useAdminList";
import { matchesSearch, paginateRecords, sortRecords } from "../../utils/adminList";
import { AdminListTools, AdminListPagination } from "../../components/admin/AdminListTools";
import { useEffect, useState } from "react";
import { ChevronRight, ImageOff, Pencil, Plus } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";

import CourseStatusActions from "../../components/admin/CourseStatusActions";
import CourseSeasonActions from "../../components/admin/CourseSeasonActions";
import Notice from "../../components/ui/Notice";
import StateMessage, { RetryButton } from "../../components/ui/StateMessage";
import StatusBadge from "../../components/ui/StatusBadge";
import { getAdminCourses } from "../../services/courses.service";
import { COURSE_STATUS, COURSE_TYPES, canEditCourse, courseTypeLabel } from "../../constants/course";
import { formatCapacity, formatDateTime, formatPrice } from "../../utils/format";

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


function matchesFilter(course, filter) {
    return filter === "todos" || course.status === FILTER_STATUS[filter];
}

// Filtro por tipo de curso (?tipo=workshop). "sin-tipo" = cursos sin tipo asignado.
const TYPE_ALL = "";
const TYPE_NONE = "sin-tipo";

function matchesType(course, type) {
    if (type === TYPE_ALL) return true;
    if (type === TYPE_NONE) return !course.courseType;
    return course.courseType === type;
}

function CoursesList() {
    const [state, setState] = useState({ status: "loading", courses: [], error: null });
    const [reloadKey, setReloadKey] = useState(0);
    // Aviso después de publicar, pasar a borrador o archivar
    const [notice, setNotice] = useState(null);

    // El filtro vive en la URL (?estado=...) para conservarlo al volver del detalle
    const list = useAdminList();
    const searchParams = list.params;
    const filter = FILTERS.some((f) => f.value === searchParams.get("estado"))
        ? searchParams.get("estado")
        : "todos";

    const typeParam = searchParams.get("tipo") ?? TYPE_ALL;
    const typeFilter =
        typeParam === TYPE_NONE || COURSE_TYPES.some((t) => t.value === typeParam)
            ? typeParam
            : TYPE_ALL;

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

    function handleStatusError(message, action) {
        setNotice({ variant: "error", text: message, action });
    }

    function handleSeasonChanged(updated, message) {
        setState((previous) => ({
            ...previous,
            courses: previous.courses.map((course) => course.id === updated.id ? updated : course)
        }));
        setNotice({ variant: "success", text: message });
    }

    const changeFilter = (value) => list.setParam("estado", value === "todos" ? "" : value);
    const changeType = (value) => list.setParam("tipo", value);
    const clearFilters = list.clear;
    const searched = state.courses.filter((course) => matchesSearch([course.name], list.debounced));

    // Los contadores de estado respetan el tipo elegido, y viceversa
    const ofType = searched.filter((c) => matchesType(c, typeFilter));
    const ofStatus = searched.filter((c) => matchesFilter(c, filter));

    const counts = {
        todos: ofType.length,
        publicados: ofType.filter((c) => matchesFilter(c, "publicados")).length,
        borradores: ofType.filter((c) => matchesFilter(c, "borradores")).length,
        archivados: ofType.filter((c) => matchesFilter(c, "archivados")).length
    };

    const typeCount = (value) => ofStatus.filter((c) => matchesType(c, value)).length;
    const hasUntyped = state.courses.some((c) => !c.courseType);

    const orders = [["updated-desc", "Última modificación"], ["created-desc", "Creados más recientes"], ["created-asc", "Creados más antiguos"], ["name-asc", "Nombre: A–Z"], ["name-desc", "Nombre: Z–A"]];
    const order = orders.some(([key]) => key === searchParams.get("orden")) ? searchParams.get("orden") : "updated-desc";
    const filteredCourses = sortRecords(ofType.filter((c) => matchesFilter(c, filter)), order);
    const pagination = paginateRecords(filteredCourses, searchParams.get("pagina"));
    const visibleCourses = pagination.items;
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
                <Notice
                    variant={notice.variant}
                    action={notice.action}
                    onClose={() => setNotice(null)}
                >
                    {notice.text}
                </Notice>
            )}

            <AdminListTools list={list} placeholder="Buscar por nombre del curso…" orders={orders} defaultOrder="updated-desc" disabled={state.status !== "success"} />
            <div className={styles.filterBar}>
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

                <label className={styles.typeFilter}>
                    <span>Tipo de curso</span>
                    <select
                        value={typeFilter}
                        onChange={(event) => changeType(event.target.value)}
                        disabled={state.status !== "success"}
                    >
                        <option value={TYPE_ALL}>Todos los tipos</option>
                        {COURSE_TYPES.map((type) => (
                            <option key={type.value} value={type.value}>
                                {type.label}
                                {state.status === "success" ? ` (${typeCount(type.value)})` : ""}
                            </option>
                        ))}
                        {hasUntyped && (
                            <option value={TYPE_NONE}>
                                Sin tipo ({typeCount(TYPE_NONE)})
                            </option>
                        )}
                    </select>
                </label>
            </div>

            {state.status === "success" && <AdminListPagination total={filteredCourses.length} noun="cursos" pagination={pagination} onPage={(page) => list.setParam("pagina", String(page))} />}
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
                        title="No hay cursos con estos filtros"
                        description="Pruebe con otro filtro para ver el resto de los cursos."
                        action={
                            <button
                                type="button"
                                className="btn btn-secondary"
                                onClick={clearFilters}
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
                                                    <span className={styles.name}>
                                                        {course.name}
                                                        {courseTypeLabel(course.courseType) && (
                                                            <span className={styles.typeTag}>
                                                                {courseTypeLabel(course.courseType)}
                                                            </span>
                                                        )}
                                                        {course.seasonName && (
                                                            <span
                                                                className={styles.typeTag}
                                                                title={`Temporada: ${course.seasonName}`}
                                                            >
                                                                Temporada: {course.seasonName}
                                                            </span>
                                                        )}
                                                    </span>
                                                    <span className={styles.secondary}>
                                                        {course.summary}
                                                    </span>
                                                    <div className={styles.planning}>
                                                        <span><strong>Instructor:</strong> {course.instructor ?? "Sin asignar"}</span>
                                                        <span><strong>Capacidad:</strong> {formatCapacity(course.capacity)}</span>
                                                        <span><strong>Precio:</strong> {course.price == null ? "Sin definir" : formatPrice(course.price)}</span>
                                                    </div>
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
                                            <CourseSeasonActions
                                                course={course}
                                                editTo={`${detailUrl}/editar#course-seasonName`}
                                                editState={detailState}
                                                allowEdit={canEditCourse(course)}
                                                onChanged={handleSeasonChanged}
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
