export const COURSE_STATUS = Object.freeze({
    DRAFT: "draft",
    PUBLISHED: "published",
    ARCHIVED: "archived"
});





// Planning data (capacity, schedule, price, instructor) may stay empty while
// the course is a draft, but it must be complete before publication (HU-A02).
// TODO Confirmar con el cliente los límites y el formato del horario.

// Creates a normalized course object with its default values.
export function buildCourse(data) {
    return {
        name: data.name,
        summary: data.summary,
        description: data.description,
        imageUrl: data.imageUrl ?? null,
        learningOutcomes: data.learningOutcomes ?? [],
        requiredMaterials: data.requiredMaterials ?? [],
        capacity: data.capacity ?? null,
        price: data.price ?? null,
        instructor: data.instructor ?? null,
        schedule: data.schedule ?? null,
        status: COURSE_STATUS.DRAFT
    };
}