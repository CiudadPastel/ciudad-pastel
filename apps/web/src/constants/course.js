/*
 * Estados de un curso. Coinciden con COURSE_STATUS del backend
 * (apps/api/src/models/course.model.js).
 */
export const COURSE_STATUS = {
    DRAFT: "draft",
    PUBLISHED: "published",
    ARCHIVED: "archived"
};

export const COURSE_STATUS_LABELS = {
    [COURSE_STATUS.DRAFT]: "Borrador",
    [COURSE_STATUS.PUBLISHED]: "Publicado",
    [COURSE_STATUS.ARCHIVED]: "Archivado"
};

/*
 * Tipos de curso. Los valores coinciden con COURSE_TYPE del backend
 * (apps/api/src/models/course.model.js); el texto es lo que se muestra.
 * schedule: horario que se elige solo al escoger el tipo (se puede cambiar).
 *   Talleres, demostrativos y semidemostrativos son de un solo día;
 *   el básico y el de varias semanas tienen una clase por semana.
 */
export const COURSE_TYPES = [
    { value: "basic", label: "Básico", plural: "cursos básicos", schedule: "weekly" },
    { value: "workshop", label: "Taller", plural: "talleres", schedule: "single" },
    { value: "demonstrative", label: "Demostrativo", plural: "cursos demostrativos", schedule: "single" },
    { value: "semi_demonstrative", label: "Semidemostrativo", plural: "cursos semidemostrativos", schedule: "single" },
    { value: "multi_week", label: "Varias semanas", plural: "cursos de varias semanas", schedule: "weekly" },
    { value: "other", label: "Otro", plural: null, schedule: null }
];

export function getCourseType(value) {
    return COURSE_TYPES.find((type) => type.value === value) ?? null;
}

export function courseTypeLabel(value) {
    return COURSE_TYPES.find((type) => type.value === value)?.label ?? null;
}

export function isPublished(course) {
    return course?.status === COURSE_STATUS.PUBLISHED;
}

/*
 * Cambios de estado permitidos. Igual que COURSE_STATUS_TRANSITIONS
 * en apps/api/src/services/course.service.js.
 * Un curso archivado puede volver a borrador antes de publicarse.
 */
export const COURSE_STATUS_TRANSITIONS = {
    [COURSE_STATUS.DRAFT]: [COURSE_STATUS.PUBLISHED, COURSE_STATUS.ARCHIVED],
    [COURSE_STATUS.PUBLISHED]: [COURSE_STATUS.DRAFT, COURSE_STATUS.ARCHIVED],
    [COURSE_STATUS.ARCHIVED]: [COURSE_STATUS.DRAFT]
};

export function canChangeStatus(course, nextStatus) {
    return COURSE_STATUS_TRANSITIONS[course?.status]?.includes(nextStatus) ?? false;
}

/** Los cursos archivados deben volver a borrador antes de editarse. */
export function canEditCourse(course) {
    return course?.status !== COURSE_STATUS.ARCHIVED;
}
