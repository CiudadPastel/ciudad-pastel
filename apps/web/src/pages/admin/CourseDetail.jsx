import { useEffect, useState } from "react";
import {
    ArrowLeft,
    GraduationCap,
    ImageOff,
    Package,
    Pencil
} from "lucide-react";
import { Link, useLocation, useParams } from "react-router-dom";

import CourseStatusActions from "../../components/admin/CourseStatusActions";
import Notice from "../../components/ui/Notice";
import StateMessage, { RetryButton } from "../../components/ui/StateMessage";
import StatusBadge from "../../components/ui/StatusBadge";
import { getAdminCourseById } from "../../services/courses.service";
import { COURSE_STATUS, canEditCourse } from "../../constants/course";
import { formatDateTime } from "../../utils/format";

import styles from "./CourseDetail.module.css";

function CourseDetail() {
    const { id } = useParams();
    const location = useLocation();

    // Vuelve a la lista con el mismo filtro que tenía la persona
    const backTo = location.state?.from || "/admin/cursos";

    // Aviso que llega desde otra pantalla, ej. "El curso se creó correctamente"
    const flash = location.state?.flash;
    const [notice, setNotice] = useState(flash ? { variant: "success", text: flash } : null);

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
    const visibilityText = {
        [COURSE_STATUS.PUBLISHED]: "Este curso se muestra en la oferta pública de la Academia.",
        [COURSE_STATUS.DRAFT]: "Borrador: este curso no es visible para el público.",
        [COURSE_STATUS.ARCHIVED]: "Archivado: este curso ya no se ofrece ni es visible para el público."
    }[course.status];

    return (
        <section className={styles.page}>
            {backLink}

            {notice && (
                <Notice variant={notice.variant} onClose={() => setNotice(null)}>
                    {notice.text}
                </Notice>
            )}

            <article className={styles.card}>
                <div className={styles.top}>
                    <CourseImage url={course.imageUrl} name={course.name} />

                    <div className={styles.intro}>
                        <header className={styles.header}>
                            <h1>{course.name}</h1>
                            <StatusBadge status={course.status} />
                            {canEditCourse(course) && (
                                <Link
                                    to={`/admin/cursos/${course.id}/editar`}
                                    state={{ from: backTo }}
                                    className={`btn btn-secondary ${styles.editButton}`}
                                >
                                    <Pencil size={16} aria-hidden="true" />
                                    Editar
                                </Link>
                            )}
                        </header>

                        <p className={styles.visibility}>
                            {visibilityText}
                        </p>

                        <CourseStatusActions
                            course={course}
                            onChanged={(updated, message) => {
                                setState((prev) => ({ ...prev, course: updated }));
                                setNotice({ variant: "success", text: message });
                            }}
                            onError={(message) => setNotice({ variant: "error", text: message })}
                        />

                        {course.summary && (
                            <p className={styles.summary}>{course.summary}</p>
                        )}
                    </div>
                </div>

                {course.description && (
                    <section className={styles.block}>
                        <h2>Descripción</h2>
                        <p className={styles.description}>{course.description}</p>
                    </section>
                )}

                <div className={styles.lists}>
                    <ItemList
                        icon={GraduationCap}
                        title="¿Qué aprenderá el estudiante?"
                        items={course.learningOutcomes}
                        emptyText="No se han agregado aprendizajes."
                    />
                    <ItemList
                        icon={Package}
                        title="Materiales que debe traer"
                        items={course.requiredMaterials}
                        emptyText="No se han agregado materiales."
                    />
                </div>

                <footer className={styles.meta}>
                    <span>Creado: {formatDateTime(course.createdAt)}</span>
                    <span>Última modificación: {formatDateTime(course.updatedAt)}</span>
                </footer>
            </article>
        </section>
    );
}

function CourseImage({ url, name }) {
    const [broken, setBroken] = useState(false);

    if (!url || broken) {
        return (
            <div className={styles.imageEmpty}>
                <ImageOff size={32} aria-hidden="true" />
                <span>{url ? "No se pudo cargar la imagen" : "Sin imagen"}</span>
            </div>
        );
    }

    return (
        <img
            src={url}
            alt={`Imagen del curso ${name}`}
            className={styles.image}
            onError={() => setBroken(true)}
        />
    );
}

function ItemList({ icon: Icon, title, items = [], emptyText }) {
    return (
        <section className={styles.block}>
            <h2>
                <Icon size={18} aria-hidden="true" className={styles.blockIcon} />
                {title}
            </h2>
            {items.length === 0 ? (
                <p className={styles.empty}>{emptyText}</p>
            ) : (
                <ul className={styles.itemList}>
                    {items.map((item) => (
                        <li key={item}>{item}</li>
                    ))}
                </ul>
            )}
        </section>
    );
}

export default CourseDetail;
