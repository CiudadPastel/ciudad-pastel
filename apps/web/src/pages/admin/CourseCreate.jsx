import { ArrowLeft } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";

import CourseForm from "../../components/admin/CourseForm";
import { createCourse } from "../../services/courses.service";

import styles from "./CourseCreate.module.css";

function CourseCreate() {
    const navigate = useNavigate();

    async function handleSubmit(payload) {
        const course = await createCourse(payload);

        // Lleva al detalle del curso recién creado con un aviso de éxito
        navigate(`/admin/cursos/${course.id}`, {
            replace: true,
            state: {
                flash: `El curso "${course.name}" se creó correctamente.`
            }
        });
    }

    return (
        <section className={styles.page}>
            <Link to="/admin/cursos" className={styles.back}>
                <ArrowLeft size={16} aria-hidden="true" />
                Volver a cursos
            </Link>

            <header>
                <h1>Nuevo curso</h1>
                <p className={styles.subtitle}>
                    Registre la información del curso. Podrá modificarla después.
                </p>
            </header>

            <CourseForm
                isNew
                submitLabel="Guardar curso"
                onSubmit={handleSubmit}
                onCancel={() => navigate("/admin/cursos")}
            />
        </section>
    );
}

export default CourseCreate;
