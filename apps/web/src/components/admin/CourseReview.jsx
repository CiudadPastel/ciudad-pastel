import { courseTypeLabel } from "../../constants/course";
import { formatPrice } from "../../utils/format";
import { formatLongDate, formatScheduleRange, formatScheduleSummary } from "../../utils/schedule";
import { COURSE_STEPS } from "../../utils/courseSteps";
import styles from "./CourseForm.module.css";

function ReviewFields({ fields }) {
    return (
        <dl className={styles.reviewDetails}>
            {fields.map(([label, value]) => (
                <div key={label}>
                    <dt>{label}</dt>
                    <dd>{Array.isArray(value) && value.length > 0
                        ? <ul>{value.map((item, index) => <li key={index}>{item}</li>)}</ul>
                        : value == null || value === "" || Array.isArray(value) ? "Sin definir" : value}</dd>
                </div>
            ))}
        </dl>
    );
}

// Uses the same normalized payload as the final save. No writes or conversions
// to another contract take place when reviewing or returning to a stage.
export default function CourseReview({ payload, onEdit, disabled }) {
    const schedule = payload.schedule;
    const sections = [
        [
            ["Nombre", payload.name],
            ["Tipo de curso", courseTypeLabel(payload.courseType)],
            ["Resumen", payload.summary],
            ["Descripción", payload.description],
            ["Enlace de la imagen", payload.imageUrl]
        ],
        [
            ["Aprendizajes", payload.learningOutcomes],
            ["Más detalle de lo que aprenderá", payload.whatYouWillLearn],
            ["Materiales que debe traer", payload.requiredMaterials],
            ["Nota sobre los materiales", payload.materialsNote],
            ["Requisitos previos", payload.prerequisites]
        ],
        [
            ["Lugar", payload.location],
            ["Dirección", payload.address],
            ["Instructor", payload.instructor],
            ["Cupo", payload.capacity],
            ["Precio", payload.price == null ? null : formatPrice(payload.price)],
            ["Monto para reservar", payload.reservationAmount == null ? null : formatPrice(payload.reservationAmount)],
            ["Nota del precio", payload.priceNote]
        ],
        [
            ["Horario", formatScheduleSummary(schedule)],
            ["Frecuencia", schedule ? schedule.frequency === "weekly" ? "Una vez por semana" : "Un solo día" : null],
            ["Clases", formatScheduleRange(schedule)],
            ["Fecha de inicio", schedule?.startDate ? formatLongDate(schedule.startDate) : null],
            ["Fecha de fin", schedule?.endDate ? formatLongDate(schedule.endDate) : null],
            ["Hora de inicio", schedule?.startTime],
            ["Hora de fin", schedule?.endTime],
            ["Nota del horario", schedule?.scheduleNote]
        ]
    ];

    return (
        <section className={styles.section} aria-label="Revisión del curso">
            <p>Revise los datos antes de guardar. Puede regresar a editar cada etapa.</p>
            {sections.map((fields, index) => (
                <section key={COURSE_STEPS[index].title} aria-labelledby={`course-review-${index}`}>
                    <div className={styles.reviewHeading}>
                        <h3 id={`course-review-${index}`}>{COURSE_STEPS[index].title}</h3>
                        <button type="button" className="btn btn-secondary" disabled={disabled}
                            onClick={() => onEdit(index)} aria-label={`Editar ${COURSE_STEPS[index].title.toLowerCase()}`}>
                            Editar
                        </button>
                    </div>
                    <ReviewFields fields={fields} />
                </section>
            ))}
        </section>
    );
}
