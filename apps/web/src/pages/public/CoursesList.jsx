import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, BookOpen, CalendarDays, ChefHat, Eye, GraduationCap, Hand, ImageOff } from "lucide-react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";

import CategoryGrid from "../../components/public/CategoryGrid";
import ResultsCount from "../../components/ui/ResultsCount";
import { COURSE_TYPES } from "../../constants/course";
import { courseCategories, filterCourses, incrementalItems } from "../../utils/catalog";
import StateMessage, { RetryButton } from "../../components/ui/StateMessage";
import { getPublicCourses } from "../../services/publicCourses.service";
import { formatPrice } from "../../utils/format";
import { formatScheduleRange, formatScheduleSummary } from "../../utils/schedule";

import styles from "./CoursesList.module.css";

const COURSE_TYPE_ICONS = {
    basic: GraduationCap,
    workshop: ChefHat,
    demonstrative: Eye,
    semi_demonstrative: Hand,
    multi_week: CalendarDays,
    other: BookOpen,
    "sin-tipo": BookOpen
};
const BLOCK_SIZE = 12;

function CoursesList() {
    const [searchParams, setSearchParams] = useSearchParams();
    const location = useLocation();
    const navigate = useNavigate();
    const headingRef = useRef(null);
    const listRef = useRef(null);
    const previousView = useRef(null);
    const pendingAppend = useRef(null);
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

    const categories = useMemo(() => courseCategories(state.courses, COURSE_TYPES), [state.courses]);
    const filtered = useMemo(() => filterCourses(state.courses, type), [state.courses, type]);
    const requestedBlocks = searchParams.get("pagina");
    const { items: visibleCourses, blocks, hasMore } = useMemo(
        () => incrementalItems(filtered, requestedBlocks, BLOCK_SIZE), [filtered, requestedBlocks]
    );
    const catalogUrl = location.pathname + location.search;
    const status = state.key === reloadKey ? state.status : "loading";
    const selection = showCategories ? "categories" : `type:${type || "all"}`;
    const focusCourseId = location.state?.focusCourseId;

    useLayoutEffect(() => {
        if (status !== "success") return;
        const previous = previousView.current;
        previousView.current = { selection, blocks, key: location.key };
        const appended = pendingAppend.current;
        pendingAppend.current = null;
        const cards = [...(listRef.current?.querySelectorAll("[data-course-id]") || [])];
        if (appended && previous?.selection === selection && blocks > previous.blocks) {
            // New cards remain after the current ones. Keyboard users can continue
            // from the first new card without moving the viewport on append.
            cards[appended.count]?.focus({ preventScroll: true });
            window.scrollTo({ top: appended.scrollY, behavior: "instant" });
        } else if (focusCourseId && previous?.key !== location.key) {
            const card = cards.find((element) => element.dataset.courseId === focusCourseId);
            if (card) {
                card.focus({ preventScroll: true });
                card.scrollIntoView({ block: "center", behavior: "instant" });
            } else {
                headingRef.current?.focus();
            }
        } else if (!previous || previous.selection !== selection || previous.blocks !== blocks) {
            headingRef.current?.focus({ preventScroll: true });
            headingRef.current?.scrollIntoView({ block: "start", behavior: "instant" });
        }
    }, [status, selection, blocks, location.key, focusCourseId]);

    function loadMore() {
        if (!hasMore) return;
        pendingAppend.current = { count: visibleCourses.length, scrollY: window.scrollY };
        const next = new URLSearchParams(searchParams);
        next.set("pagina", blocks + 1);
        setSearchParams(next, { replace: true });
    }

    function rememberCourse(id) {
        navigate(catalogUrl, { replace: true, state: { focusCourseId: id } });
    }

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
                    <h1 ref={headingRef} tabIndex={-1}>
                        {showCategories ? "Cursos de repostería" : type
                            ? `Cursos: ${categories.find((category) => category.id === type)?.name || "Tipo no disponible"}`
                            : "Todos los cursos"}
                    </h1>
                    <p className={styles.subtitle}>Encuentra el próximo curso para llevar tus ideas a la mesa.</p>
                </div>
            </header>

            {showCategories ? (
                <>
                    {state.courses.length === 0 && <p role="status">No hay cursos disponibles por el momento.</p>}
                    <CategoryGrid categories={categories} label="Tipos de curso" categoryIcons={COURSE_TYPE_ICONS}
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
                <ul ref={listRef} className={styles.grid} aria-label="Cursos disponibles">
                    {visibleCourses.map((course) => (
                        <li key={course.id}>
                            <Link to={`/cursos/${encodeURIComponent(course.id)}`} className={styles.card}
                                data-course-id={course.id} onClick={() => rememberCourse(course.id)}
                                state={{ from: catalogUrl, courseId: course.id }}>
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
                <ResultsCount shown={visibleCourses.length} total={filtered.length} noun="cursos" />
                {hasMore ? (
                    <button type="button" className="btn btn-secondary" onClick={loadMore}>Cargar más cursos</button>
                ) : filtered.length > 0 && (
                    <p className={styles.loading}>Llegaste al final de los cursos disponibles.</p>
                )}
            </div>
            </>}
        </section>
    );
}

export default CoursesList;