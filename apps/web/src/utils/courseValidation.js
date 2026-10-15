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
    capacity: { min: 1, max: 100 },
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
    scheduleDescription: "",
    scheduleStartDate: "",
    scheduleEndDate: ""
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
        scheduleDescription: course.schedule?.description ?? "",
        scheduleStartDate: course.schedule?.startDate ?? "",
        scheduleEndDate: course.schedule?.endDate ?? ""
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
    return Boolean(
        values.scheduleDescription.trim() ||
        values.scheduleStartDate ||
        values.scheduleEndDate
    );
}

function checkWholeNumber(raw, { min, max }, label) {
    const value = Number(raw);
    if (!Number.isInteger(value)) return `${label} debe ser un número entero, sin decimales.`;
    if (value < min || value > max) {
        return `${label} debe estar entre ${min.toLocaleString("es-CR")} y ${max.toLocaleString("es-CR")}.`;
    }
    return null;
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

    // El horario va completo o vacío: si se llena una parte, se piden las demás
    if (hasSchedule(values) || requirePlanning) {
        const description = values.scheduleDescription.trim();
        const descriptionError = checkLength(
            description,
            COURSE_LIMITS.scheduleDescription,
            requirePlanning && !hasSchedule(values)
                ? requiredMessage
                : "Describa cuándo se imparte el curso.",
            "La descripción del horario"
        );
        if (descriptionError) errors.scheduleDescription = descriptionError;

        if (!values.scheduleStartDate) {
            errors.scheduleStartDate = "Indique la fecha de inicio.";
        }

        if (
            values.scheduleEndDate &&
            values.scheduleStartDate &&
            values.scheduleEndDate < values.scheduleStartDate
        ) {
            errors.scheduleEndDate = "La fecha de fin no puede ser anterior a la de inicio.";
        }
    }

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
                description: values.scheduleDescription.trim(),
                startDate: values.scheduleStartDate,
                endDate: values.scheduleEndDate || null
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
    scheduleDescription: `La descripción del horario debe tener entre ${COURSE_LIMITS.scheduleDescription.min} y ${COURSE_LIMITS.scheduleDescription.max} caracteres.`,
    scheduleStartDate: "La fecha de inicio no es válida.",
    scheduleEndDate: "La fecha de fin no es válida o es anterior a la de inicio."
};

// Nombres de la API -> nombres de los campos del formulario
const API_FIELD_ALIASES = {
    "schedule.description": "scheduleDescription",
    "schedule.startDate": "scheduleStartDate",
    "schedule.endDate": "scheduleEndDate",
    schedule: "scheduleDescription"
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
