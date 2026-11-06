import { useEffect, useRef, useState } from "react";
import {
    ArrowLeft,
    ArrowRight,
    CalendarCheck,
    CalendarDays,
    CircleAlert,
    EyeOff,
    ImageOff,
    LoaderCircle,
    Save,
    X
} from "lucide-react";

import ListEditor from "../ui/ListEditor";
import { COURSE_TYPES, getCourseType } from "../../constants/course";
import {
    COURSE_LIMITS,
    EMPTY_COURSE_FORM,
    getScheduleEndDate,
    isValidHttpUrl,
    mapApiValidationErrors,
    toCoursePayload,
    toSchedulePayload,
    validateCourseForm
} from "../../utils/courseValidation";
import { formatPrice } from "../../utils/format";
import {
    SCHEDULE_TYPE,
    SESSION_LIMITS,
    WEEKDAYS,
    formatLongDate,
    formatScheduleRange,
    formatScheduleSummary,
    nextWeekday,
    weekdayName,
    weekdayOf
} from "../../utils/schedule";

import styles from "./CourseForm.module.css";
import StepProgress from "../ui/StepProgress";
import stepStyles from "../ui/StepProgress.module.css";
import { COURSE_STEPS, courseStepForField } from "../../utils/courseSteps";

// Orden de los campos con validación, para enfocar el primer error
const FIELD_ORDER = [
    "name",
    "courseType",
    "summary",
    "description",
    "imageUrl",
    "learningOutcomes",
    "requiredMaterials",
    "whatYouWillLearn",
    "materialsNote",
    "prerequisites",
    "location",
    "address",
    "instructor",
    "capacity",
    "price",
    "reservationAmount",
    "priceNote",
    "scheduleType",
    "scheduleWeekday",
    "scheduleSessions",
    "scheduleStartDate",
    "scheduleStartTime",
    "scheduleEndTime",
    "scheduleNote"
];

const SCHEDULE_FIELDS = FIELD_ORDER.filter((field) => field.startsWith("schedule"));

const SCHEDULE_OPTIONS = [
    { value: SCHEDULE_TYPE.NONE, label: "Todavía no", hint: "Lo define después" },
    { value: SCHEDULE_TYPE.SINGLE, label: "Un solo día", hint: "Taller, demostrativo o semidemostrativo" },
    { value: SCHEDULE_TYPE.WEEKLY, label: "Una vez por semana", hint: "Básico o varias semanas" }
];

const SCHEDULE_TEXT = {
    [SCHEDULE_TYPE.SINGLE]: "de un solo día",
    [SCHEDULE_TYPE.WEEKLY]: "de una clase por semana"
};

/*
 * En horario semanal, si ya hay fecha de inicio pero no día de la semana,
 * el día se toma de la fecha (si empieza un lunes, son los lunes).
 */
function fillWeekday(values) {
    if (
        values.scheduleType === SCHEDULE_TYPE.WEEKLY &&
        !values.scheduleWeekday &&
        values.scheduleStartDate
    ) {
        return { ...values, scheduleWeekday: weekdayOf(values.scheduleStartDate) };
    }
    return values;
}

// Vista previa del monto en colones mientras se escribe
function moneyPreview(raw) {
    const value = Number(raw);
    return raw.trim() && Number.isInteger(value) && value >= 0 ? formatPrice(value) : "";
}

/**
 * Formulario de curso reutilizable (crear y editar).
 *   initialValues: valores iniciales (vacío al crear, datos del curso al editar)
 *   isNew: true al crear (muestra el aviso de "Borrador")
 *   submitLabel: texto del botón principal
 *   onSubmit(payload): async; si falla, el error se muestra en el formulario
 *   onCancel(): se llama al cancelar
 *   requireChanges: true al editar; el botón Guardar se activa solo si hay cambios
 *   requirePrice: true si el curso está publicado (la API exige precio)
 */
function CourseForm({
    initialValues = EMPTY_COURSE_FORM,
    isNew = false,
    submitLabel = "Guardar curso",
    onSubmit,
    onCancel,
    requireChanges = false,
    requirePrice = false
}) {
    const [currentStep, setCurrentStep] = useState(() =>
        courseStepForField(window.location.hash.replace("#course-", ""))
    );
    const headingRef = useRef(null);
    const pendingFocus = useRef(window.location.hash.slice(1));
    const savingRef = useRef(false);
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
    const validationOptions = { requirePrice };

    useEffect(() => {
        const target = pendingFocus.current && document.getElementById(pendingFocus.current);
        pendingFocus.current = "";
        (target || headingRef.current)?.focus();
    }, [currentStep]);

    function focusField(field) {
        const step = courseStepForField(field);
        if (step !== currentStep) {
            pendingFocus.current = `course-${field}`;
            setCurrentStep(step);
        } else {
            const element = document.getElementById(`course-${field}`)
                || formRef.current?.elements.namedItem(field);
            (element instanceof RadioNodeList ? element[0] : element)?.focus();
        }
    }

    function continueStep() {
        const validationErrors = validateCourseForm(values, validationOptions);
        const fields = COURSE_STEPS[currentStep].fields;
        setErrors(validationErrors);
        setTouched((previous) => ({ ...previous, ...Object.fromEntries(fields.map((field) => [field, true])) }));
        const firstInvalid = fields.find((field) => validationErrors[field]);
        if (firstInvalid) return focusField(firstInvalid);
        setCurrentStep((step) => Math.min(step + 1, COURSE_STEPS.length - 1));
    }

    function updateValue(name, value) {
        let nextValues = { ...values, [name]: value };

        // Al elegir el tipo de curso, el horario se elige solo (taller = un día, etc.)
        if (name === "courseType") {
            const suggested = getCourseType(value)?.schedule;
            if (suggested) nextValues.scheduleType = suggested;
        }

        nextValues = fillWeekday(nextValues);
        setValues(nextValues);

        // Se revalida mientras escribe; los errores solo se ven en campos ya visitados
        setErrors(validateCourseForm(nextValues, validationOptions));
    }

    function changeScheduleType(type) {
        setTouched((prev) => ({ ...prev, scheduleType: true }));
        updateValue("scheduleType", type);
    }

    function handleChange(event) {
        updateValue(event.target.name, event.target.value);
    }

    function handleBlur(event) {
        const { name } = event.target;
        setTouched((prev) => ({ ...prev, [name]: true }));
        setErrors(validateCourseForm(values, validationOptions));
    }

    async function handleSubmit(event) {
        event.preventDefault();
        if (savingRef.current) return;
        if (currentStep < COURSE_STEPS.length - 1) {
            continueStep();
            return;
        }
        setServerError("");
        setServerDetails([]);

        const validationErrors = validateCourseForm(values, validationOptions);
        setErrors(validationErrors);
        setTouched(Object.fromEntries(FIELD_ORDER.map((f) => [f, true])));

        const firstInvalid = FIELD_ORDER.find((f) => validationErrors[f]);
        if (firstInvalid) {
            focusField(firstInvalid);
            return;
        }

        savingRef.current = true;
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
                focusField(Object.keys(apiFieldErrors)[0]);
            }
            setServerError(error.message || "No se pudo guardar el curso.");
            savingRef.current = false;
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

    const hasScheduleType = values.scheduleType !== SCHEDULE_TYPE.NONE;
    const isWeekly = values.scheduleType === SCHEDULE_TYPE.WEEKLY;
    const endDate = getScheduleEndDate(values);

    // Vista previa del horario solo cuando está completo y sin errores
    const currentErrors = validateCourseForm(values, validationOptions);
    const scheduleComplete = hasScheduleType && !SCHEDULE_FIELDS.some((field) => currentErrors[field]);
    const schedulePreview = scheduleComplete ? toSchedulePayload(values) : null;

    // Si la fecha no cae en el día elegido, se ofrece la siguiente que sí
    const suggestedStartDate =
        isWeekly &&
        values.scheduleWeekday &&
        values.scheduleStartDate &&
        weekdayOf(values.scheduleStartDate) !== values.scheduleWeekday
            ? nextWeekday(values.scheduleStartDate, values.scheduleWeekday)
            : null;

    // Aviso según el tipo de curso: "Los talleres son de un solo día."
    const courseType = getCourseType(values.courseType);
    const scheduleHint = courseType?.schedule
        ? values.scheduleType === courseType.schedule
            ? `Elegido según el tipo de curso: los ${courseType.plural} son ${SCHEDULE_TEXT[courseType.schedule]}.`
            : `Normalmente los ${courseType.plural} son ${SCHEDULE_TEXT[courseType.schedule]}.`
        : undefined;

    const star = <span className={styles.star} aria-hidden="true">*</span>;
    const pricePreview = moneyPreview(values.price);
    const reservationPreview = moneyPreview(values.reservationAmount);

    return (
        <form ref={formRef} onSubmit={handleSubmit} className={styles.form} noValidate>
            <StepProgress steps={COURSE_STEPS} currentStep={currentStep} label="Pasos del curso" />
            <h2 ref={headingRef} tabIndex={-1} className={stepStyles.stepHeading}>
                Paso {currentStep + 1} de {COURSE_STEPS.length}: {COURSE_STEPS[currentStep].title}
            </h2>
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

            <fieldset className={styles.section} hidden={currentStep !== 0} disabled={submitting || currentStep !== 0}>
                <legend>Información general</legend>

                <div className={styles.grid}>
                    <div className={styles.field}>
                        <label htmlFor="course-name">Nombre del curso {star}</label>
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
                        <label htmlFor="course-courseType">Tipo de curso</label>
                        <select {...fieldProps("courseType")}>
                            <option value="">Sin definir</option>
                            {COURSE_TYPES.map((type) => (
                                <option key={type.value} value={type.value}>
                                    {type.label}
                                </option>
                            ))}
                        </select>
                        {renderMessages("courseType")}
                    </div>
                </div>

                <div className={styles.field}>
                    <label htmlFor="course-summary">Resumen {star}</label>
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
                    <label htmlFor="course-description">Descripción {star}</label>
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

            <fieldset className={styles.section} hidden={currentStep !== 0} disabled={submitting || currentStep !== 0}>
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

            <fieldset className={styles.section} hidden={currentStep !== 1} disabled={submitting || currentStep !== 1}>
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

                {renderMessages("learningOutcomes")}
                <div className={styles.field}>
                    <label htmlFor="course-whatYouWillLearn">Más detalle de lo que aprenderá</label>
                    <textarea
                        rows={3}
                        maxLength={COURSE_LIMITS.longText.max}
                        placeholder="Ej.: Prepararemos masas y cremas desde cero, paso a paso."
                        {...fieldProps("whatYouWillLearn")}
                    />
                    {renderMessages("whatYouWillLearn", "Opcional. Texto libre que complementa la lista.")}
                </div>

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

                {renderMessages("requiredMaterials")}
                <div className={styles.field}>
                    <label htmlFor="course-materialsNote">Nota sobre los materiales</label>
                    <textarea
                        rows={2}
                        maxLength={COURSE_LIMITS.longText.max}
                        placeholder="Ej.: Los ingredientes principales están incluidos."
                        {...fieldProps("materialsNote")}
                    />
                    {renderMessages("materialsNote", "Opcional.")}
                </div>

                <div className={styles.field}>
                    <label htmlFor="course-prerequisites">Requisitos previos</label>
                    <textarea
                        rows={2}
                        maxLength={COURSE_LIMITS.longText.max}
                        placeholder="Ej.: Haber llevado el curso básico."
                        {...fieldProps("prerequisites")}
                    />
                    {renderMessages("prerequisites", "Opcional. Déjelo vacío si no se necesita experiencia.")}
                </div>
            </fieldset>

            <fieldset className={styles.section} hidden={currentStep !== 2} disabled={submitting || currentStep !== 2}>
                <legend>Lugar</legend>

                <div className={styles.field}>
                    <label htmlFor="course-location">Lugar</label>
                    <input
                        type="text"
                        maxLength={COURSE_LIMITS.location.max}
                        placeholder="Ej.: Ciudad Pastel — Florencia"
                        {...fieldProps("location")}
                    />
                    {renderMessages("location", "Opcional.")}
                </div>

                <div className={styles.field}>
                    <label htmlFor="course-address">Dirección</label>
                    <textarea
                        rows={2}
                        maxLength={COURSE_LIMITS.address.max}
                        placeholder="Ej.: 100 m norte de la escuela"
                        {...fieldProps("address")}
                    />
                    {renderMessages("address", "Opcional. Señas para llegar.")}
                </div>
            </fieldset>

            <fieldset className={styles.section} hidden={currentStep !== 2} disabled={submitting || currentStep !== 2}>
                <legend>Planificación</legend>

                <p className={styles.sectionHint}>
                    {requirePrice
                        ? "Este curso está publicado: debe tener precio (₡0 si es gratis)."
                        : "Para publicar el curso solo se necesita el precio. Lo demás es opcional."}
                </p>

                <div className={styles.grid}>
                    <div className={`${styles.field} ${styles.full}`}>
                        <label htmlFor="course-instructor">Instructor</label>
                        <input
                            type="text"
                            maxLength={COURSE_LIMITS.instructor.max}
                            placeholder="Ej.: Yamilena Blanco"
                            autoComplete="off"
                            {...fieldProps("instructor")}
                        />
                        {renderMessages("instructor")}
                    </div>

                    <div className={styles.field}>
                        <label htmlFor="course-capacity">Cupo</label>
                        <input
                            type="number"
                            inputMode="numeric"
                            min={COURSE_LIMITS.capacity.min}
                            step={1}
                            placeholder="Ej.: 6"
                            {...fieldProps("capacity")}
                        />
                        {renderMessages("capacity")}
                    </div>

                    <div className={styles.field}>
                        <label htmlFor="course-price">
                            Precio{requirePrice && <> {star}</>}
                        </label>
                        <div className={styles.prefixed}>
                            <span className={styles.prefix} aria-hidden="true">₡</span>
                            <input
                                type="number"
                                inputMode="numeric"
                                min={COURSE_LIMITS.price.min}
                                step={1}
                                placeholder="Ej.: 30000"
                                {...fieldProps("price")}
                            />
                        </div>
                        {renderMessages("price", pricePreview || "Necesario para publicar. 0 si es gratis.")}
                    </div>

                    <div className={styles.field}>
                        <label htmlFor="course-reservationAmount">Monto para reservar</label>
                        <div className={styles.prefixed}>
                            <span className={styles.prefix} aria-hidden="true">₡</span>
                            <input
                                type="number"
                                inputMode="numeric"
                                min={COURSE_LIMITS.reservationAmount.min}
                                step={1}
                                placeholder="Ej.: 10000"
                                {...fieldProps("reservationAmount")}
                            />
                        </div>
                        {renderMessages("reservationAmount", reservationPreview || "Opcional.")}
                    </div>

                    <div className={styles.field}>
                        <label htmlFor="course-priceNote">Nota del precio</label>
                        <input
                            type="text"
                            maxLength={COURSE_LIMITS.longText.max}
                            placeholder="Ej.: ₡10 000 matrícula + ₡20 000 por clase"
                            {...fieldProps("priceNote")}
                        />
                        {renderMessages("priceNote", "Opcional. Para casos especiales.")}
                    </div>
                </div>

            </fieldset>
            <fieldset className={styles.section} hidden={currentStep !== 3} disabled={submitting || currentStep !== 3}>
                <legend><CalendarDays size={18} aria-hidden="true" /> Horario</legend>

                <div className={styles.field}>
                    <span id="course-scheduleType-label" className={styles.groupLabel}>
                        ¿Cómo son las clases?
                    </span>
                    <div
                        id="course-scheduleType"
                        tabIndex={-1}
                        role="radiogroup"
                        aria-labelledby="course-scheduleType-label"
                        className={styles.choices}
                    >
                        {SCHEDULE_OPTIONS.map((option) => (
                            <label
                                key={option.value || "none"}
                                className={`${styles.choice} ${values.scheduleType === option.value ? styles.choiceActive : ""}`}
                            >
                                <input
                                    type="radio"
                                    name="scheduleType"
                                    value={option.value}
                                    checked={values.scheduleType === option.value}
                                    onChange={() => changeScheduleType(option.value)}
                                    disabled={submitting}
                                />
                                <span>
                                    <strong>{option.label}</strong>
                                    <small>{option.hint}</small>
                                </span>
                            </label>
                        ))}
                    </div>
                    {renderMessages("scheduleType", scheduleHint)}
                </div>

                {isWeekly && (
                    <div className={styles.grid}>
                        <div className={styles.field}>
                            <label htmlFor="course-scheduleWeekday">Día de la semana {star}</label>
                            <select {...fieldProps("scheduleWeekday")}>
                                <option value="">Elija un día</option>
                                {WEEKDAYS.map((day) => (
                                    <option key={day.value} value={day.value}>
                                        {day.name.charAt(0).toUpperCase() + day.name.slice(1)}
                                    </option>
                                ))}
                            </select>
                            {renderMessages("scheduleWeekday")}
                        </div>

                        <div className={styles.field}>
                            <label htmlFor="course-scheduleSessions">Cantidad de clases {star}</label>
                            <input
                                type="number"
                                inputMode="numeric"
                                min={SESSION_LIMITS.min}
                                max={SESSION_LIMITS.max}
                                step={1}
                                placeholder="Ej.: 6"
                                {...fieldProps("scheduleSessions")}
                            />
                            {renderMessages("scheduleSessions")}
                        </div>
                    </div>
                )}

                {hasScheduleType && (
                    <div className={styles.grid}>
                        <div className={styles.field}>
                            <label htmlFor="course-scheduleStartDate">
                                {isWeekly ? "Fecha de la primera clase" : "Fecha de la clase"} {star}
                            </label>
                            <input type="date" {...fieldProps("scheduleStartDate")} />
                            {renderMessages(
                                "scheduleStartDate",
                                isWeekly && values.scheduleWeekday
                                    ? `Debe ser un ${weekdayName(values.scheduleWeekday)}.`
                                    : undefined
                            )}
                            {suggestedStartDate && (
                                <button
                                    type="button"
                                    className={styles.suggestion}
                                    onClick={() => updateValue("scheduleStartDate", suggestedStartDate)}
                                    disabled={submitting}
                                >
                                    Usar el {formatLongDate(suggestedStartDate, { withYear: false })}
                                </button>
                            )}
                        </div>

                        <div className={styles.field}>
                            <span className={styles.groupLabel}>
                                {isWeekly ? "Última clase" : "Duración"}
                            </span>
                            <p className={styles.computed} aria-live="polite">
                                {isWeekly
                                    ? endDate
                                        ? formatLongDate(endDate)
                                        : suggestedStartDate
                                            ? "Corrija la fecha de la primera clase."
                                            : "Se calcula sola con el día, la cantidad de clases y la fecha de inicio."
                                    : "Un solo día."}
                            </p>
                        </div>

                        <div className={styles.field}>
                            <label htmlFor="course-scheduleStartTime">Hora de inicio {star}</label>
                            <input type="time" step={900} {...fieldProps("scheduleStartTime")} />
                            {renderMessages("scheduleStartTime")}
                        </div>

                        <div className={styles.field}>
                            <label htmlFor="course-scheduleEndTime">Hora de fin {star}</label>
                            <input type="time" step={900} {...fieldProps("scheduleEndTime")} />
                            {renderMessages("scheduleEndTime")}
                        </div>

                        <div className={`${styles.field} ${styles.full}`}>
                            <label htmlFor="course-scheduleNote">Nota del horario</label>
                            <textarea
                                rows={2}
                                maxLength={COURSE_LIMITS.longText.max}
                                placeholder="Ej.: No hay clase el 2 de noviembre (feriado)."
                                {...fieldProps("scheduleNote")}
                            />
                            {renderMessages("scheduleNote", "Opcional.")}
                        </div>
                    </div>
                )}

                {schedulePreview && (
                    <div className={styles.schedulePreview} aria-live="polite">
                        <CalendarCheck size={20} aria-hidden="true" />
                        <div>
                            <span>Así se mostrará el horario</span>
                            <strong>{formatScheduleSummary(schedulePreview)}</strong>
                            {formatScheduleRange(schedulePreview) && (
                                <small>{formatScheduleRange(schedulePreview)}</small>
                            )}
                        </div>
                    </div>
                )}
            </fieldset>

            {currentStep === COURSE_STEPS.length - 1 && (
                <section className={styles.section} aria-label="Revisión del curso">
                    <h3>{values.name}</h3>
                    <p>{values.summary}</p>
                    <p>{values.description}</p>
                    <p>Tipo: {courseType?.label || "Sin definir"}</p>
                    <p>Precio: {pricePreview || "Sin definir"} · Cupo: {values.capacity || "Sin definir"}</p>
                    <p>Lugar: {values.location || "Sin definir"}</p>
                    <p>{schedulePreview ? formatScheduleSummary(schedulePreview) : "Horario sin definir"}</p>
                    <p>Revise los pasos anteriores antes de guardar.</p>
                </section>
            )}
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

                {currentStep > 0 && (
                    <button type="button" className="btn btn-secondary" disabled={submitting}
                        onClick={() => setCurrentStep((step) => step - 1)}>
                        <ArrowLeft size={18} aria-hidden="true" /> Anterior
                    </button>
                )}
                <button
                    type="submit"
                    className="btn btn-primary"
                    // Evita que el campo pierda el foco antes del clic: al perderlo
                    // aparece su mensaje de error, el botón se mueve y el clic falla.
                    onMouseDown={(event) => event.preventDefault()}
                    disabled={submitting || (currentStep === COURSE_STEPS.length - 1 && nothingToSave)}
                    title={currentStep === COURSE_STEPS.length - 1 && nothingToSave ? "No hay cambios para guardar" : undefined}
                >
                    {submitting ? (
                        <LoaderCircle size={18} className={styles.spin} aria-hidden="true" />
                    ) : (
                        currentStep < COURSE_STEPS.length - 1 ? <ArrowRight size={18} aria-hidden="true" /> : <Save size={18} aria-hidden="true" />
                    )}
                    {submitting ? "Guardando…" : currentStep < COURSE_STEPS.length - 1 ? "Siguiente" : submitLabel}
                </button>
            </div>
        </form>
    );
}

export default CourseForm;
