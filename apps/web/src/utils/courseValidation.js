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
    requiredMaterials: { maxItems: 30, maxLength: 150 }
};

export const EMPTY_COURSE_FORM = {
    name: "",
    summary: "",
    description: "",
    imageUrl: "",
    learningOutcomes: [],
    requiredMaterials: []
};

/** Convierte un curso de la API en valores para el formulario (al editar). */
export function courseToFormValues(course) {
    return {
        name: course.name ?? "",
        summary: course.summary ?? "",
        description: course.description ?? "",
        imageUrl: course.imageUrl ?? "",
        learningOutcomes: course.learningOutcomes ?? [],
        requiredMaterials: course.requiredMaterials ?? []
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

export function validateCourseForm(values) {
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
        requiredMaterials: cleanList(values.requiredMaterials)
    };
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
    requiredMaterials: `Revise los materiales: máximo ${COURSE_LIMITS.requiredMaterials.maxItems}, de hasta ${COURSE_LIMITS.requiredMaterials.maxLength} caracteres cada uno.`
};

export function mapApiValidationErrors(details) {
    const fieldErrors = {};
    const list = Array.isArray(details) ? details : [];

    for (const detail of list) {
        const field = String(detail).match(/^[a-zA-Z]+/)?.[0];
        if (field && API_FIELD_MESSAGES[field]) {
            fieldErrors[field] = API_FIELD_MESSAGES[field];
        }
    }

    return fieldErrors;
}
