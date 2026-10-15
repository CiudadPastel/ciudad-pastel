import {
    SCHEDULE_TYPE,
    SESSION_LIMITS,
    buildScheduleDescription,
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
    // Planificación (HU-A02). El precio es un número entero de colones.
    // Las clases son pequeñas. La API todavía acepta hasta 100: pedir a backend que lo baje.
    capacity: { min: 1, max: 8 },
    price: { min: 0, max: 10000000 },
    instructor: { min: 3, max: 120 },
    scheduleDescription: { min: 3, max: 200 }
};

export const EMPTY_COURSE_FORM = {
    name: "",
    summary: "",
    description: "",
    imageUrl: "",
    learningOutcomes: [],
    requiredMaterials: [],
    instructor: "",
    capacity: "",
    price: "",
    ...scheduleToFormFields(null)
};

/** Convierte un curso de la API en valores para el formulario (al editar). */
export function courseToFormValues(course) {
    return {
        name: course.name ?? "",
        summary: course.summary ?? "",
        description: course.description ?? "",
        imageUrl: course.imageUrl ?? "",
        learningOutcomes: course.learningOutcomes ?? [],
        requiredMaterials: course.requiredMaterials ?? [],
        instructor: course.instructor ?? "",
        capacity: course.capacity == null ? "" : String(course.capacity),
        price: course.price == null ? "" : String(course.price),
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
    if (value.length < min) return `${label} debe tener al menos ${min} caracteres.`;
    if (value.length > max) return `${label} puede tener como máximo ${max} caracteres.`;
    return null;
}

export function validateCourseForm(values, options = {}) {
    const errors = {};

    const nameError = checkLength(
        values.name.trim(),
        COURSE_LIMITS.name,
        "Escriba el nombre del curso.",
        "El nombre"
    );
    if (nameError) errors.name = nameError;

    const summaryError = checkLength(
        values.summary.trim(),
        COURSE_LIMITS.summary,
        "Escriba un resumen corto del curso.",
        "El resumen"
    );
    if (summaryError) errors.summary = summaryError;

    const descriptionError = checkLength(
        values.description.trim(),
        COURSE_LIMITS.description,
        "Escriba la descripción del curso.",
        "La descripción"
    );
    if (descriptionError) errors.description = descriptionError;

    const imageUrl = values.imageUrl.trim();
    if (imageUrl && !isValidHttpUrl(imageUrl)) {
        errors.imageUrl = "La dirección debe empezar con https:// o http://";
    }

    Object.assign(errors, validatePlanning(values, options));

    return errors;
}

function hasSchedule(values) {
    return values.scheduleType !== SCHEDULE_TYPE.NONE;
}

function checkWholeNumber(raw, { min, max }, label) {
    const value = Number(raw);
    if (!Number.isInteger(value)) return `${label} debe ser un número entero, sin decimales.`;
    if (value < min || value > max) {
        return `${label} debe estar entre ${min.toLocaleString("es-CR")} y ${max.toLocaleString("es-CR")}.`;
    }
    return null;
}

function validateSchedule(values, requirePlanning, requiredMessage) {
    const errors = {};
    const type = values.scheduleType;

    if (type === SCHEDULE_TYPE.NONE) {
        if (requirePlanning) errors.scheduleType = requiredMessage;
        return errors;
    }

    const weekly = type === SCHEDULE_TYPE.WEEKLY;

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

/** Texto del horario, o null si el horario todavía no está completo. */
export function getScheduleDescription(values) {
    if (!hasSchedule(values)) return null;
    const errors = validateSchedule(values, false, "");
    if (Object.keys(errors).length > 0) return null;

    return buildScheduleDescription({
        type: values.scheduleType,
        weekday: values.scheduleWeekday,
        sessions: Number(values.scheduleSessions),
        startDate: values.scheduleStartDate,
        startTime: values.scheduleStartTime,
        endTime: values.scheduleEndTime
    });
}

/*
 * Planificación (HU-A02): puede quedar vacía en un borrador, pero un curso
 * publicado debe tenerla completa (con requirePlanning: true).
 */
function validatePlanning(values, { requirePlanning = false } = {}) {
    const errors = {};
    const requiredMessage = "Obligatorio para un curso publicado.";

    const instructor = values.instructor.trim();
    if (instructor) {
        const error = checkLength(instructor, COURSE_LIMITS.instructor, "", "El nombre del instructor");
        if (error) errors.instructor = error;
    } else if (requirePlanning) {
        errors.instructor = requiredMessage;
    }

    const capacity = values.capacity.trim();
    if (capacity) {
        const error = checkWholeNumber(capacity, COURSE_LIMITS.capacity, "El cupo");
        if (error) errors.capacity = error;
    } else if (requirePlanning) {
        errors.capacity = requiredMessage;
    }

    const price = values.price.trim();
    if (price) {
        const error = checkWholeNumber(price, COURSE_LIMITS.price, "El precio");
        if (error) errors.price = error;
    } else if (requirePlanning) {
        errors.price = requiredMessage;
    }

    Object.assign(errors, validateSchedule(values, requirePlanning, requiredMessage));

    return errors;
}

/** Convierte los valores del formulario al formato que espera la API. */
export function toCoursePayload(values) {
    const cleanList = (items) => items.map((item) => item.trim()).filter(Boolean);

    return {
        name: values.name.trim(),
        summary: values.summary.trim(),
        description: values.description.trim(),
        imageUrl: values.imageUrl.trim() || null,
        learningOutcomes: cleanList(values.learningOutcomes),
        requiredMaterials: cleanList(values.requiredMaterials),
        instructor: values.instructor.trim() || null,
        capacity: values.capacity.trim() ? Number(values.capacity) : null,
        price: values.price.trim() ? Number(values.price) : null,
        schedule: hasSchedule(values)
            ? {
                startDate: values.scheduleStartDate,
                endDate: getScheduleEndDate(values),
                startTime: values.scheduleStartTime,
                endTime: values.scheduleEndTime,
                description: getScheduleDescription(values)
            }
            : null
    };
}

const PLANNING_FIELD_LABELS = {
    instructor: "instructor",
    capacity: "cupo",
    price: "precio",
    schedule: "horario"
};

/**
 * Convierte errores como "capacity is required for a published course."
 * en un mensaje en español. Devuelve null si no son de planificación.
 */
export function describeMissingPlanning(details) {
    const list = Array.isArray(details) ? details : [];
    const missing = list
        .filter((detail) => /is required for a published course/.test(String(detail)))
        .map((detail) => PLANNING_FIELD_LABELS[String(detail).split(" ")[0]])
        .filter(Boolean);

    if (missing.length === 0) return null;

    const names = missing.length === 1
        ? missing[0]
        : `${missing.slice(0, -1).join(", ")} y ${missing.at(-1)}`;

    return `Para publicar este curso falta completar su planificación: ${names}.`;
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
    learningOutcomes: `Revise los aprendizajes: máximo ${COURSE_LIMITS.learningOutcomes.maxItems}, de hasta ${COURSE_LIMITS.learningOutcomes.maxLength} caracteres cada uno.`,
    requiredMaterials: `Revise los materiales: máximo ${COURSE_LIMITS.requiredMaterials.maxItems}, de hasta ${COURSE_LIMITS.requiredMaterials.maxLength} caracteres cada uno.`,
    instructor: `El nombre del instructor debe tener entre ${COURSE_LIMITS.instructor.min} y ${COURSE_LIMITS.instructor.max} caracteres.`,
    capacity: `El cupo debe ser un número entero entre ${COURSE_LIMITS.capacity.min} y ${COURSE_LIMITS.capacity.max}.`,
    price: "El precio debe ser un número entero de colones, sin decimales.",
    scheduleType: "Revise el horario del curso.",
    scheduleSessions: "Revise la cantidad de clases.",
    scheduleStartDate: "La fecha de inicio no es válida.",
    scheduleStartTime: "La hora de inicio no es válida.",
    scheduleEndTime: "La hora de fin debe ser después de la de inicio."
};

// Nombres de la API -> nombres de los campos del formulario
const API_FIELD_ALIASES = {
    "schedule.description": "scheduleType",
    "schedule.startDate": "scheduleStartDate",
    "schedule.endDate": "scheduleSessions",
    "schedule.startTime": "scheduleStartTime",
    "schedule.endTime": "scheduleEndTime",
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
            ? "Obligatorio para un curso publicado."
            : API_FIELD_MESSAGES[field];
    }

    return fieldErrors;
}
