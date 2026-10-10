import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";

import CourseForm from "../../components/admin/CourseForm";
import StateMessage, { RetryButton } from "../../components/ui/StateMessage";
import StatusBadge from "../../components/ui/StatusBadge";
import { getAdminCourseById, updateCourse } from "../../services/courses.service";
import { canEditCourse } from "../../constants/course";
import { courseToFormValues } from "../../utils/courseValidation";

import styles from "./CourseCreate.module.css";

function CourseEdit() {
    const { id } = useParams();
    const navigate = useNavigate();
    const location = useLocation();

    const detailUrl = `/admin/cursos/${id}`;
    // Para que "Volver a cursos" en el detalle conserve el filtro de la lista
    const listUrl = location.state?.from || "/admin/cursos";

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

    async function handleSubmit(payload) {
        const course = await updateCourse(id, payload);

        navigate(detailUrl, {
            replace: true,
            state: {
                from: listUrl,
                flash: `Los cambios en "${course.name}" se guardaron correctamente.`
            }
        });
    }

    const status = state.id === id ? state.status : "loading";

    const backLink = (
        <Link to={detailUrl} state={{ from: listUrl }} className={styles.back}>
            <ArrowLeft size={16} aria-hidden="true" />
            Volver al curso
        </Link>
    );

    if (status === "loading") {
        return (
            <section className={styles.page} aria-busy="true">
                {backLink}
                <h1>Editar curso</h1>
                <p className={styles.subtitle} role="status">Cargando la información del curso…</p>
            </section>
        );
    }

    if (status === "error") {
        const notFound = state.error?.status === 404;

        return (
            <section className={styles.page}>
                <Link to="/admin/cursos" className={styles.back}>
                    <ArrowLeft size={16} aria-hidden="true" />
                    Volver a cursos
                </Link>
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

    if (!canEditCourse(course)) {
        return (
            <section className={styles.page}>
                {backLink}
                <StateMessage
                    title="Este curso está archivado"
                    description="Este curso está archivado. Desarchívelo primero para volver a editarlo."
                    action={
                        <Link to={detailUrl} state={{ from: listUrl }} className="btn btn-primary">
                            Volver al curso
                        </Link>
                    }
                />
            </section>
        );
    }

    return (
        <section className={styles.page}>
            {backLink}

            <header>
                <div className={styles.titleRow}>
                    <h1>Editar curso</h1>
                    <StatusBadge status={course.status} />
                </div>
                <p className={styles.subtitle}>
                    Está modificando <strong>{course.name}</strong>. Los cambios se verán
                    en cuanto los guarde.
                </p>
            </header>

            <CourseForm
                key={course.id}
                initialValues={courseToFormValues(course)}
                submitLabel="Guardar cambios"
                requireChanges
                onSubmit={handleSubmit}
                onCancel={() => navigate(detailUrl, { state: { from: listUrl } })}
            />
        </section>
    );
}

export default CourseEdit;
