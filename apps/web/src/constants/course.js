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

export function isPublished(course) {
    return course?.status === COURSE_STATUS.PUBLISHED;
}

/*
 * Cambios de estado permitidos. Igual que COURSE_STATUS_TRANSITIONS
 * en apps/api/src/services/course.service.js.
 * Un curso archivado ya no puede cambiar de estado.
 */
export const COURSE_STATUS_TRANSITIONS = {
    [COURSE_STATUS.DRAFT]: [COURSE_STATUS.PUBLISHED, COURSE_STATUS.ARCHIVED],
    [COURSE_STATUS.PUBLISHED]: [COURSE_STATUS.DRAFT, COURSE_STATUS.ARCHIVED],
    [COURSE_STATUS.ARCHIVED]: []
};

export function canChangeStatus(course, nextStatus) {
    return COURSE_STATUS_TRANSITIONS[course?.status]?.includes(nextStatus) ?? false;
}

/** Los cursos archivados no se editan: ya no se ofrecen y no pueden volver. */
export function canEditCourse(course) {
    return course?.status !== COURSE_STATUS.ARCHIVED;
}
