import { COURSE_TYPES } from "../constants/course";
import {
    SCHEDULE_TYPE,
    SESSION_LIMITS,
    computeEndDate,
    formatLongDate,
    scheduleToFormFields,
    weekdayName,
    weekdayOf
} from "./schedule";

/*
 * Reglas del formulario de curso (crear y editar).
 * Deben coincidir con apps/api/src/validators/course.validator.js:
 * si el backend cambia un límite, cambiarlo también aquí.
 */

export const COURSE_LIMITS = {
    name: { min: 3, max: 120 },
    summary: { min: 10, max: 240 },
    description: { min: 20, max: 5000 },
    imageUrlMax: 500,
    learningOutcomes: { maxItems: 15, maxLength: 200 },
    requiredMaterials: { maxItems: 30, maxLength: 150 },
    // Planificación (HU-A02). Cupo y montos sin máximo fijo (pedido de la cliente).
    capacity: { min: 1 },
    price: { min: 0 },
    reservationAmount: { min: 0 },
    instructor: { min: 3, max: 120 },
    // Textos libres opcionales (reunión con la cliente del 13 de octubre)
    location: { max: 240 },
    address: { max: 1000 },
    longText: { max: 5000 }
};

// Cupo sugerido al crear un curso nuevo
export const DEFAULT_CAPACITY = "6";

// Textos opcionales: la API guarda null si quedan vacíos
const OPTIONAL_TEXT_FIELDS = [
    "whatYouWillLearn",
    "location",
    "address",
    "materialsNote",
    "prerequisites",
    "priceNote"
];

export const EMPTY_COURSE_FORM = {
    name: "",
    courseType: "",
    summary: "",
    description: "",
    imageUrl: "",
    learningOutcomes: [],
    whatYouWillLearn: "",
    requiredMaterials: [],
    materialsNote: "",
    prerequisites: "",
    location: "",
    address: "",
    instructor: "",
    capacity: DEFAULT_CAPACITY,
    price: "",
    reservationAmount: "",
    priceNote: "",
    ...scheduleToFormFields(null)
};

const numberToField = (value) => (value == null ? "" : String(value));

/** Convierte un curso de la API en valores para el formulario (al editar). */
export function courseToFormValues(course) {
    return {
        name: course.name ?? "",
        courseType: course.courseType ?? "",
        summary: course.summary ?? "",
        description: course.description ?? "",
        imageUrl: course.imageUrl ?? "",
        learningOutcomes: course.learningOutcomes ?? [],
        whatYouWillLearn: course.whatYouWillLearn ?? "",
        requiredMaterials: course.requiredMaterials ?? [],
        materialsNote: course.materialsNote ?? "",
        prerequisites: course.prerequisites ?? "",
        location: course.location ?? "",
        address: course.address ?? "",
        instructor: course.instructor ?? "",
        capacity: numberToField(course.capacity),
        price: numberToField(course.price),
        reservationAmount: numberToField(course.reservationAmount),
        priceNote: course.priceNote ?? "",
        ...scheduleToFormFields(course.schedule)
    };
}

export function isValidHttpUrl(value) {
    try {
        const url = new URL(value);
        return url.protocol === "http:" || url.protocol === "https:";
    } catch {
        return false;
    }
}

function checkLength(value, { min, max }, emptyMessage, label) {
    if (!value) return emptyMessage;
    if (min && value.length < min) return `${label} debe tener al menos ${min} caracteres.`;
    if (value.length > max) return `${label} puede tener como máximo ${max.toLocaleString("es-CR")} caracteres.`;
    return null;
}

function checkWholeNumber(raw, { min }, label) {
    const value = Number(raw);
    if (!Number.isInteger(value)) return `${label} debe ser un número entero, sin decimales.`;
    if (value < min) return `${label} debe ser de ${min} o más.`;
    return null;
}

/**
 * Valida el formulario. Con requirePrice: true (curso publicado) el precio
 * es obligatorio, igual que en la API. Puede ser ₡0 si el curso es gratis.
 */
export function validateCourseForm(values, { requirePrice = false } = {}) {
    const errors = {};

    const nameError = checkLength(values.name.trim(), COURSE_LIMITS.name, "Escriba el nombre del curso.", "El nombre");
    if (nameError) errors.name = nameError;

    const summaryError = checkLength(values.summary.trim(), COURSE_LIMITS.summary, "Escriba un resumen corto del curso.", "El resumen");
    if (summaryError) errors.summary = summaryError;

    const descriptionError = checkLength(values.description.trim(), COURSE_LIMITS.description, "Escriba la descripción del curso.", "La descripción");
    if (descriptionError) errors.description = descriptionError;

    const imageUrl = values.imageUrl.trim();
    if (imageUrl && !isValidHttpUrl(imageUrl)) {
        errors.imageUrl = "La dirección debe empezar con https:// o http://";
    }

    if (values.courseType && !COURSE_TYPES.some((type) => type.value === values.courseType)) {
        errors.courseType = "Elija un tipo de curso de la lista.";
    }

    const textLimits = {
        location: [COURSE_LIMITS.location, "El lugar"],
        address: [COURSE_LIMITS.address, "La dirección"],
        whatYouWillLearn: [COURSE_LIMITS.longText, "El texto"],
        materialsNote: [COURSE_LIMITS.longText, "La nota"],
        prerequisites: [COURSE_LIMITS.longText, "El texto"],
        priceNote: [COURSE_LIMITS.longText, "La nota"]
    };
    for (const [field, [limits, label]] of Object.entries(textLimits)) {
        const error = values[field].trim() && checkLength(values[field].trim(), limits, "", label);
        if (error) errors[field] = error;
    }

    const instructor = values.instructor.trim();
    if (instructor) {
        const error = checkLength(instructor, COURSE_LIMITS.instructor, "", "El nombre del instructor");
        if (error) errors.instructor = error;
    }

    const capacity = values.capacity.trim();
    if (capacity) {
        const error = checkWholeNumber(capacity, COURSE_LIMITS.capacity, "El cupo");
        if (error) errors.capacity = error;
    }

    const price = values.price.trim();
    if (price) {
        const error = checkWholeNumber(price, COURSE_LIMITS.price, "El precio");
        if (error) errors.price = error;
    } else if (requirePrice) {
        errors.price = "Un curso publicado necesita precio. Si es gratis, escriba 0.";
    }

    const reservation = values.reservationAmount.trim();
    if (reservation) {
        const error = checkWholeNumber(reservation, COURSE_LIMITS.reservationAmount, "El monto de reserva");
        if (error) errors.reservationAmount = error;
    }

    Object.assign(errors, validateSchedule(values));

    return errors;
}

function hasSchedule(values) {
    return values.scheduleType !== SCHEDULE_TYPE.NONE;
}

/* El horario es opcional, pero si se elige un tipo hay que completarlo. */
function validateSchedule(values) {
    const errors = {};
    if (!hasSchedule(values)) return errors;

    const weekly = values.scheduleType === SCHEDULE_TYPE.WEEKLY;

    if (weekly) {
        if (!values.scheduleWeekday) {
            errors.scheduleWeekday = "Elija el día de la semana.";
        }

        const sessions = Number(values.scheduleSessions);
        if (
            !values.scheduleSessions ||
            !Number.isInteger(sessions) ||
            sessions < SESSION_LIMITS.min ||
            sessions > SESSION_LIMITS.max
        ) {
            errors.scheduleSessions = `Indique cuántas clases son (de ${SESSION_LIMITS.min} a ${SESSION_LIMITS.max}).`;
        }
    }

    if (!values.scheduleStartDate) {
        errors.scheduleStartDate = weekly
            ? "Elija la fecha de la primera clase."
            : "Elija la fecha de la clase.";
    } else if (
        weekly &&
        values.scheduleWeekday &&
        weekdayOf(values.scheduleStartDate) !== values.scheduleWeekday
    ) {
        errors.scheduleStartDate =
            `El ${formatLongDate(values.scheduleStartDate)} no es ${weekdayName(values.scheduleWeekday)}.`;
    }

    if (!values.scheduleStartTime) {
        errors.scheduleStartTime = "Indique la hora de inicio.";
    }

    if (!values.scheduleEndTime) {
        errors.scheduleEndTime = "Indique la hora de fin.";
    } else if (values.scheduleStartTime && values.scheduleEndTime <= values.scheduleStartTime) {
        errors.scheduleEndTime = "La hora de fin debe ser después de la de inicio.";
    }

    const note = values.scheduleNote.trim();
    if (note.length > COURSE_LIMITS.longText.max) {
        errors.scheduleNote = `La nota puede tener como máximo ${COURSE_LIMITS.longText.max.toLocaleString("es-CR")} caracteres.`;
    }

    return errors;
}

/** Fecha de la última clase, o null si todavía faltan datos para calcularla. */
export function getScheduleEndDate(values) {
    if (!values.scheduleStartDate) return null;
    if (values.scheduleType === SCHEDULE_TYPE.SINGLE) return values.scheduleStartDate;

    const sessions = Number(values.scheduleSessions);
    if (
        values.scheduleType !== SCHEDULE_TYPE.WEEKLY ||
        // Si la fecha no cae en el día elegido, el cálculo no tendría sentido
        (values.scheduleWeekday && weekdayOf(values.scheduleStartDate) !== values.scheduleWeekday) ||
        !Number.isInteger(sessions) ||
        sessions < SESSION_LIMITS.min ||
        sessions > SESSION_LIMITS.max
    ) {
        return null;
    }

    return computeEndDate(values.scheduleStartDate, sessions);
}

/** Horario en el formato de la API, o null si no hay horario. */
export function toSchedulePayload(values) {
    if (!hasSchedule(values)) return null;
    const weekly = values.scheduleType === SCHEDULE_TYPE.WEEKLY;

    return {
        startDate: values.scheduleStartDate,
        endDate: getScheduleEndDate(values),
        startTime: values.scheduleStartTime,
        endTime: values.scheduleEndTime,
        frequency: values.scheduleType,
        weekday: weekly ? values.scheduleWeekday : null,
        scheduleNote: values.scheduleNote.trim() || null
    };
}

/** Convierte los valores del formulario al formato que espera la API. */
export function toCoursePayload(values) {
    const cleanList = (items) => items.map((item) => item.trim()).filter(Boolean);
    const toNumber = (raw) => (raw.trim() ? Number(raw) : null);

    return {
        name: values.name.trim(),
        courseType: values.courseType || null,
        summary: values.summary.trim(),
        description: values.description.trim(),
        imageUrl: values.imageUrl.trim() || null,
        learningOutcomes: cleanList(values.learningOutcomes),
        requiredMaterials: cleanList(values.requiredMaterials),
        ...Object.fromEntries(OPTIONAL_TEXT_FIELDS.map((field) => [field, values[field].trim() || null])),
        instructor: values.instructor.trim() || null,
        capacity: toNumber(values.capacity),
        price: toNumber(values.price),
        reservationAmount: toNumber(values.reservationAmount),
        schedule: toSchedulePayload(values)
    };
}

/**
 * Si la API rechazó publicar porque falta el precio, devuelve el mensaje
 * en español. Si el error es otro, devuelve null.
 */
export function describePublishError(details) {
    const list = Array.isArray(details) ? details : [];
    const priceProblem = list.some((detail) => /^price\b/.test(String(detail)));

    return priceProblem
        ? "Para publicar este curso falta el precio. Si es gratis, puede poner ₡0."
        : null;
}

/*
 * El backend devuelve los errores de validación como una lista en inglés,
 * ej. ["name must contain at least 3 characters."]. Esta función los
 * convierte en mensajes en español agrupados por campo.
 */
const API_FIELD_MESSAGES = {
    name: `El nombre debe tener entre ${COURSE_LIMITS.name.min} y ${COURSE_LIMITS.name.max} caracteres.`,
    summary: `El resumen debe tener entre ${COURSE_LIMITS.summary.min} y ${COURSE_LIMITS.summary.max} caracteres.`,
    description: `La descripción debe tener entre ${COURSE_LIMITS.description.min} y ${COURSE_LIMITS.description.max} caracteres.`,
    imageUrl: "La dirección de la imagen no es válida.",
    courseType: "Elija un tipo de curso de la lista.",
    learningOutcomes: `Revise los aprendizajes: máximo ${COURSE_LIMITS.learningOutcomes.maxItems}, de hasta ${COURSE_LIMITS.learningOutcomes.maxLength} caracteres cada uno.`,
    requiredMaterials: `Revise los materiales: máximo ${COURSE_LIMITS.requiredMaterials.maxItems}, de hasta ${COURSE_LIMITS.requiredMaterials.maxLength} caracteres cada uno.`,
    whatYouWillLearn: "Revise este texto.",
    materialsNote: "Revise la nota de materiales.",
    prerequisites: "Revise los requisitos.",
    location: `El lugar puede tener como máximo ${COURSE_LIMITS.location.max} caracteres.`,
    address: `La dirección puede tener como máximo ${COURSE_LIMITS.address.max} caracteres.`,
    instructor: `El nombre del instructor debe tener entre ${COURSE_LIMITS.instructor.min} y ${COURSE_LIMITS.instructor.max} caracteres.`,
    capacity: "El cupo debe ser un número entero de 1 o más.",
    price: "El precio debe ser un número entero de colones, sin decimales.",
    reservationAmount: "El monto de reserva debe ser un número entero de colones, sin decimales.",
    priceNote: "Revise la nota del precio.",
    scheduleType: "Revise el horario del curso.",
    scheduleWeekday: "Elija el día de la semana.",
    scheduleSessions: "Revise la cantidad de clases.",
    scheduleStartDate: "La fecha de inicio no es válida.",
    scheduleStartTime: "La hora de inicio no es válida.",
    scheduleEndTime: "La hora de fin debe ser después de la de inicio.",
    scheduleNote: "Revise la nota del horario."
};

// Nombres de la API -> nombres de los campos del formulario
const API_FIELD_ALIASES = {
    "schedule.startDate": "scheduleStartDate",
    "schedule.endDate": "scheduleSessions",
    "schedule.startTime": "scheduleStartTime",
    "schedule.endTime": "scheduleEndTime",
    "schedule.frequency": "scheduleType",
    "schedule.weekday": "scheduleWeekday",
    "schedule.scheduleNote": "scheduleNote",
    schedule: "scheduleType"
};

export function mapApiValidationErrors(details) {
    const fieldErrors = {};
    const list = Array.isArray(details) ? details : [];

    for (const detail of list) {
        const text = String(detail);
        const apiField = text.match(/^[a-zA-Z.]+/)?.[0];
        const field = API_FIELD_ALIASES[apiField] ?? apiField;

        if (!field || !API_FIELD_MESSAGES[field]) continue;

        fieldErrors[field] = /is required for a published course/.test(text)
            ? "Un curso publicado necesita precio. Si es gratis, escriba 0."
            : API_FIELD_MESSAGES[field];
    }

    return fieldErrors;
}
