import { useRef, useState } from "react";
import { CalendarDays, CircleAlert, EyeOff, ImageOff, LoaderCircle, Save, X } from "lucide-react";

import ListEditor from "../ui/ListEditor";
import {
    COURSE_LIMITS,
    EMPTY_COURSE_FORM,
    isValidHttpUrl,
    mapApiValidationErrors,
    toCoursePayload,
    validateCourseForm
} from "../../utils/courseValidation";
import { formatPrice } from "../../utils/format";

import styles from "./CourseForm.module.css";

// Orden de los campos con validación, para enfocar el primer error
const FIELD_ORDER = [
    "name",
    "summary",
    "description",
    "imageUrl",
    "instructor",
    "capacity",
    "price",
    "scheduleDescription",
    "scheduleStartDate",
    "scheduleEndDate"
];

/**
 * Formulario de curso reutilizable (crear y editar).
 *   initialValues: valores iniciales (vacío al crear, datos del curso al editar)
 *   isNew: true al crear (muestra el aviso de "Borrador")
 *   submitLabel: texto del botón principal
 *   onSubmit(payload): async; si falla, el error se muestra en el formulario
 *   onCancel(): se llama al cancelar
 *   requireChanges: true al editar; el botón Guardar se activa solo si hay cambios
 *   requirePlanning: true si el curso está publicado (la planificación es obligatoria)
 */
function CourseForm({
    initialValues = EMPTY_COURSE_FORM,
    isNew = false,
    submitLabel = "Guardar curso",
    onSubmit,
    onCancel,
    requireChanges = false,
    requirePlanning = false
}) {
    const [values, setValues] = useState(initialValues);
    const [errors, setErrors] = useState({});
    const [touched, setTouched] = useState({});
    const [submitting, setSubmitting] = useState(false);
    const [serverError, setServerError] = useState("");
    const [serverDetails, setServerDetails] = useState([]);
    const [brokenImage, setBrokenImage] = useState("");

    const formRef = useRef(null);

    const isDirty = JSON.stringify(values) !== JSON.stringify(initialValues);
    const nothingToSave = requireChanges && !isDirty;

    function updateValue(name, value) {
        const nextValues = { ...values, [name]: value };
        setValues(nextValues);

        // Si el campo ya mostraba error, se revalida mientras escribe
        if (touched[name]) {
            setErrors(validateCourseForm(nextValues, { requirePlanning }));
        }
    }

    function handleChange(event) {
        updateValue(event.target.name, event.target.value);
    }

    function handleBlur(event) {
        const { name } = event.target;
        setTouched((prev) => ({ ...prev, [name]: true }));
        setErrors(validateCourseForm(values, { requirePlanning }));
    }

    async function handleSubmit(event) {
        event.preventDefault();
        setServerError("");
        setServerDetails([]);

        const validationErrors = validateCourseForm(values, { requirePlanning });
        setErrors(validationErrors);
        setTouched(Object.fromEntries(FIELD_ORDER.map((f) => [f, true])));

        const firstInvalid = FIELD_ORDER.find((f) => validationErrors[f]);
        if (firstInvalid) {
            formRef.current?.elements.namedItem(firstInvalid)?.focus();
            return;
        }

        setSubmitting(true);

        try {
            await onSubmit(toCoursePayload(values));
        } catch (error) {
            // Errores de validación del backend (lista en inglés -> mensajes en español)
            const apiFieldErrors = mapApiValidationErrors(error.details);
            if (Object.keys(apiFieldErrors).length > 0) {
                setErrors((prev) => ({ ...prev, ...apiFieldErrors }));
                setTouched((prev) => ({
                    ...prev,
                    ...Object.fromEntries(Object.keys(apiFieldErrors).map((f) => [f, true]))
                }));
                setServerDetails(Object.values(apiFieldErrors));
            }
            setServerError(error.message || "No se pudo guardar el curso.");
            setSubmitting(false);
        }
    }

    function handleCancel() {
        if (
            isDirty &&
            !window.confirm("Hay cambios sin guardar. ¿Desea salir y descartarlos?")
        ) {
            return;
        }
        onCancel();
    }

    function fieldProps(name) {
        const showError = touched[name] && errors[name];
        return {
            id: `course-${name}`,
            name,
            value: values[name],
            onChange: handleChange,
            onBlur: handleBlur,
            disabled: submitting,
            "aria-invalid": showError ? true : undefined,
            "aria-describedby": `course-${name}-hint course-${name}-error`
        };
    }

    function renderMessages(name, hint) {
        return (
            <>
                {hint && (
                    <p id={`course-${name}-hint`} className={styles.hint}>
                        {hint}
                    </p>
                )}
                {touched[name] && errors[name] && (
                    <p id={`course-${name}-error`} className={styles.fieldError}>
                        <CircleAlert size={14} aria-hidden="true" />
                        {errors[name]}
                    </p>
                )}
            </>
        );
    }

    const imageUrl = values.imageUrl.trim();
    const canPreview = imageUrl && isValidHttpUrl(imageUrl);

    const priceNumber = Number(values.price);
    const pricePreview =
        values.price.trim() && Number.isInteger(priceNumber) && priceNumber >= 0
            ? formatPrice(priceNumber)
            : "";

    // En un curso publicado la planificación es obligatoria
    const requiredStar = requirePlanning ? (
        <>
            {" "}
            <span className={styles.star} aria-hidden="true">*</span>
        </>
    ) : null;

    return (
        <form ref={formRef} onSubmit={handleSubmit} className={styles.form} noValidate>
            {serverError && (
                <div role="alert" className={styles.serverError}>
                    <CircleAlert size={18} aria-hidden="true" />
                    <div>
                        <strong>No se pudo guardar el curso.</strong>
                        <p>{serverError}</p>
                        {serverDetails.length > 0 && (
                            <ul className={styles.serverDetails}>
                                {serverDetails.map((detail) => (
                                    <li key={detail}>{detail}</li>
                                ))}
                            </ul>
                        )}
                    </div>
                </div>
            )}

            <p className={styles.required}>
                Los campos marcados con <span aria-hidden="true">*</span> son obligatorios.
            </p>

            <fieldset className={styles.section}>
                <legend>Información general</legend>

                <div className={styles.field}>
                    <label htmlFor="course-name">
                        Nombre del curso <span className={styles.star} aria-hidden="true">*</span>
                    </label>
                    <input
                        type="text"
                        maxLength={COURSE_LIMITS.name.max}
                        placeholder="Ej.: Repostería básica"
                        required
                        {...fieldProps("name")}
                    />
                    {renderMessages("name")}
                </div>

                <div className={styles.field}>
                    <label htmlFor="course-summary">
                        Resumen <span className={styles.star} aria-hidden="true">*</span>
                    </label>
                    <input
                        type="text"
                        maxLength={COURSE_LIMITS.summary.max}
                        placeholder="Una frase que explique de qué trata el curso"
                        required
                        {...fieldProps("summary")}
                    />
                    {renderMessages(
                        "summary",
                        `Se muestra en la lista de cursos. Entre ${COURSE_LIMITS.summary.min} y ${COURSE_LIMITS.summary.max} caracteres (lleva ${values.summary.trim().length}).`
                    )}
                </div>

                <div className={styles.field}>
                    <label htmlFor="course-description">
                        Descripción <span className={styles.star} aria-hidden="true">*</span>
                    </label>
                    <textarea
                        rows={5}
                        maxLength={COURSE_LIMITS.description.max}
                        placeholder="Explique con detalle el contenido del curso y a quién va dirigido."
                        required
                        {...fieldProps("description")}
                    />
                    {renderMessages(
                        "description",
                        `Mínimo ${COURSE_LIMITS.description.min} caracteres (lleva ${values.description.trim().length} de ${COURSE_LIMITS.description.max}).`
                    )}
                </div>
            </fieldset>

            <fieldset className={styles.section}>
                <legend>Imagen</legend>

                <div className={styles.imageRow}>
                    <div className={styles.field}>
                        <label htmlFor="course-imageUrl">Dirección de la imagen</label>
                        <input
                            type="url"
                            inputMode="url"
                            maxLength={COURSE_LIMITS.imageUrlMax}
                            placeholder="https://…"
                            {...fieldProps("imageUrl")}
                        />
                        {renderMessages(
                            "imageUrl",
                            "Opcional. Pegue el enlace de una foto del curso."
                        )}
                    </div>

                    <div className={styles.preview} aria-live="polite">
                        {canPreview && brokenImage !== imageUrl ? (
                            <img
                                src={imageUrl}
                                alt="Vista previa de la imagen del curso"
                                onError={() => setBrokenImage(imageUrl)}
                            />
                        ) : (
                            <div className={styles.previewEmpty}>
                                <ImageOff size={28} aria-hidden="true" />
                                <span>
                                    {canPreview
                                        ? "No se pudo cargar la imagen. Revise el enlace."
                                        : "Sin imagen"}
                                </span>
                            </div>
                        )}
                    </div>
                </div>
            </fieldset>

            <fieldset className={styles.section}>
                <legend>Contenido del curso</legend>

                <ListEditor
                    id="course-learningOutcomes"
                    label="¿Qué aprenderá el estudiante?"
                    hint="Opcional. Escriba un logro y presione Enter o Agregar."
                    placeholder="Ej.: Preparar un bizcocho esponjoso"
                    items={values.learningOutcomes}
                    onChange={(items) => updateValue("learningOutcomes", items)}
                    maxItems={COURSE_LIMITS.learningOutcomes.maxItems}
                    maxLength={COURSE_LIMITS.learningOutcomes.maxLength}
                    disabled={submitting}
                    emptyText="Todavía no hay aprendizajes agregados."
                />

                <ListEditor
                    id="course-requiredMaterials"
                    label="Materiales que debe traer"
                    hint="Opcional. Escriba un material y presione Enter o Agregar."
                    placeholder="Ej.: Delantal"
                    items={values.requiredMaterials}
                    onChange={(items) => updateValue("requiredMaterials", items)}
                    maxItems={COURSE_LIMITS.requiredMaterials.maxItems}
                    maxLength={COURSE_LIMITS.requiredMaterials.maxLength}
                    disabled={submitting}
                    emptyText="Todavía no hay materiales agregados."
                />
            </fieldset>

            <fieldset className={styles.section}>
                <legend>Planificación</legend>

                <p className={styles.sectionHint}>
                    {requirePlanning
                        ? "Este curso está publicado: la planificación debe estar completa."
                        : "Puede completarla después, pero es obligatoria para publicar el curso."}
                </p>

                <div className={styles.grid}>
                    <div className={`${styles.field} ${styles.full}`}>
                        <label htmlFor="course-instructor">
                            Instructor{requiredStar}
                        </label>
                        <input
                            type="text"
                            maxLength={COURSE_LIMITS.instructor.max}
                            placeholder="Ej.: Ana Rodríguez"
                            autoComplete="off"
                            {...fieldProps("instructor")}
                        />
                        {renderMessages("instructor")}
                    </div>

                    <div className={styles.field}>
                        <label htmlFor="course-capacity">
                            Cupo{requiredStar}
                        </label>
                        <input
                            type="number"
                            inputMode="numeric"
                            min={COURSE_LIMITS.capacity.min}
                            max={COURSE_LIMITS.capacity.max}
                            step={1}
                            placeholder="Ej.: 6"
                            {...fieldProps("capacity")}
                        />
                        {renderMessages(
                            "capacity",
                            `Cantidad máxima de estudiantes (de ${COURSE_LIMITS.capacity.min} a ${COURSE_LIMITS.capacity.max}).`
                        )}
                    </div>

                    <div className={styles.field}>
                        <label htmlFor="course-price">
                            Precio{requiredStar}
                        </label>
                        <div className={styles.prefixed}>
                            <span className={styles.prefix} aria-hidden="true">₡</span>
                            <input
                                type="number"
                                inputMode="numeric"
                                min={COURSE_LIMITS.price.min}
                                max={COURSE_LIMITS.price.max}
                                step={1}
                                placeholder="Ej.: 30000"
                                {...fieldProps("price")}
                            />
                        </div>
                        {renderMessages(
                            "price",
                            pricePreview
                                ? `En colones, sin decimales. Se mostrará como ${pricePreview}.`
                                : "En colones, sin decimales."
                        )}
                    </div>
                </div>

                <h3 className={styles.subheading}>
                    <CalendarDays size={18} aria-hidden="true" />
                    Horario
                </h3>

                <div className={styles.grid}>
                    <div className={`${styles.field} ${styles.full}`}>
                        <label htmlFor="course-scheduleDescription">
                            ¿Cuándo se imparte?{requiredStar}
                        </label>
                        <input
                            type="text"
                            maxLength={COURSE_LIMITS.scheduleDescription.max}
                            placeholder="Ej.: 5 sábados, de 9:00 a. m. a 3:00 p. m."
                            {...fieldProps("scheduleDescription")}
                        />
                        {renderMessages(
                            "scheduleDescription",
                            "Días y horas de las clases, tal como los verá el público."
                        )}
                    </div>

                    <div className={styles.field}>
                        <label htmlFor="course-scheduleStartDate">
                            Fecha de inicio{requiredStar}
                        </label>
                        <input type="date" {...fieldProps("scheduleStartDate")} />
                        {renderMessages("scheduleStartDate")}
                    </div>

                    <div className={styles.field}>
                        <label htmlFor="course-scheduleEndDate">Fecha de fin</label>
                        <input
                            type="date"
                            min={values.scheduleStartDate || undefined}
                            {...fieldProps("scheduleEndDate")}
                        />
                        {renderMessages("scheduleEndDate", "Opcional.")}
                    </div>
                </div>
            </fieldset>

            {isNew && (
                <p className={styles.note}>
                    <EyeOff size={16} aria-hidden="true" />
                    <span>
                        El curso se guardará como <strong>Borrador</strong>. El público
                        no lo verá hasta que usted lo publique.
                    </span>
                </p>
            )}

            {nothingToSave && (
                <p className={styles.noChanges} role="status">
                    Todavía no ha hecho cambios.
                </p>
            )}

            <div className={styles.actions}>
                <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={handleCancel}
                    disabled={submitting}
                >
                    <X size={18} aria-hidden="true" />
                    Cancelar
                </button>

                <button
                    type="submit"
                    className="btn btn-primary"
                    // Evita que el campo pierda el foco antes del clic: al perderlo
                    // aparece su mensaje de error, el botón se mueve y el clic falla.
                    onMouseDown={(event) => event.preventDefault()}
                    disabled={submitting || nothingToSave}
                    title={nothingToSave ? "No hay cambios para guardar" : undefined}
                >
                    {submitting ? (
                        <LoaderCircle size={18} className={styles.spin} aria-hidden="true" />
                    ) : (
                        <Save size={18} aria-hidden="true" />
                    )}
                    {submitting ? "Guardando…" : submitLabel}
                </button>
            </div>
        </form>
    );
}

export default CourseForm;
