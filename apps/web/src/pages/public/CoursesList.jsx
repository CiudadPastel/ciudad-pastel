import { useEffect, useState } from "react";
import { ArrowRight, ImageOff } from "lucide-react";
import { Link, useLocation, useSearchParams } from "react-router-dom";

import CategoryGrid from "../../components/public/CategoryGrid";
import ResultsCount from "../../components/ui/ResultsCount";
import { COURSE_TYPES } from "../../constants/course";
import { courseCategories, filterCourses, paginateItems } from "../../utils/catalog";
import StateMessage, { RetryButton } from "../../components/ui/StateMessage";
import { getPublicCourses } from "../../services/publicCourses.service";
import { formatPrice } from "../../utils/format";
import { formatScheduleRange, formatScheduleSummary } from "../../utils/schedule";

import styles from "./CoursesList.module.css";

function CoursesList() {
    const [searchParams, setSearchParams] = useSearchParams();
    const location = useLocation();
    const type = searchParams.get("tipo");
    const showCategories = !type && searchParams.get("vista") !== "todos" && !searchParams.has("pagina");
    const [reloadKey, setReloadKey] = useState(0);
    const [state, setState] = useState({ key: null, status: "loading", courses: [], error: null });

    useEffect(() => {
        let active = true;

        getPublicCourses()
            .then((courses) => {
                if (!Array.isArray(courses)) throw new Error("La lista de cursos no es válida.");
                if (active) setState({ key: reloadKey, status: "success", courses, error: null });
            })
            .catch((error) => {
                if (active) setState({ key: reloadKey, status: "error", courses: [], error });
            });

        return () => {
            active = false;
        };
    }, [reloadKey]);

    const categories = courseCategories(state.courses, COURSE_TYPES);
    const filtered = filterCourses(state.courses, type);
    const { items: visibleCourses, page, pages } = paginateItems(filtered, searchParams.get("pagina"), 12);
    const catalogUrl = location.pathname + location.search;
    function changePage(value) {
        const next = new URLSearchParams(searchParams);
        next.set("pagina", value);
        setSearchParams(next);
    }
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

            {showCategories ? (
                <>
                    {state.courses.length === 0 && <p role="status">No hay cursos disponibles por el momento.</p>}
                    <CategoryGrid categories={categories} label="Tipos de curso"
                        categoryUrl={(id) => id ? '?tipo=' + encodeURIComponent(id) : '?vista=todos'} />
                </>
            ) : <>
                <nav aria-label="Explorar cursos" className={styles.navigation}>
                    <button type="button" className="btn btn-secondary" onClick={() => setSearchParams({})}>Volver a categorías</button>
                    <label>Tipo de curso <select value={type || ""} onChange={(event) => {
                        const next = new URLSearchParams(searchParams);
                        next.delete("pagina");
                        next.set("vista", "todos");
                        if (event.target.value) next.set("tipo", event.target.value);
                        else next.delete("tipo");
                        setSearchParams(next);
                    }}>
                        <option value="">Todos los cursos</option>
                        {type && !categories.some((category) => category.id === type) && <option value={type}>Tipo no disponible</option>}
                        {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
                    </select></label>
                </nav>
            {filtered.length === 0 ? (
                <StateMessage
                    title={type ? "No hay cursos disponibles de este tipo" : "No hay cursos disponibles por el momento"}
                    description="Vuelve pronto para conocer las próximas fechas."
                />
            ) : (
                <ul className={styles.grid}>
                    {visibleCourses.map((course) => (
                        <li key={course.id}>
                            <Link to={`/cursos/${encodeURIComponent(course.id)}`} className={styles.card} state={{ from: catalogUrl }}>
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
            <div className={styles.pagination}>
                <ResultsCount shown={visibleCourses.length} total={filtered.length} noun="cursos" page={page} pageSize={12} />
                {pages > 1 && <nav aria-label="Paginación de cursos" className={styles.navigation}>
                    <button type="button" className="btn btn-secondary" disabled={page === 1} onClick={() => changePage(page - 1)}>Anterior</button>
                    <span>Página {page} de {pages}</span>
                    <button type="button" className="btn btn-secondary" disabled={page === pages} onClick={() => changePage(page + 1)}>Siguiente</button>
                </nav>}
            </div>
            </>}
        </section>
    );
}

export default CoursesList;