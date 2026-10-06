export const COURSE_STATUS = Object.freeze({
    DRAFT: "draft",
    PUBLISHED: "published",
    ARCHIVED: "archived"
});





//TODO Revisar con el cliente

// Creates a normalized course object with its default values.
export function buildCourse(data) {
    return {
        name: data.name,
        summary: data.summary,
        description: data.description,
        imageUrl: data.imageUrl ?? null,
        learningOutcomes: data.learningOutcomes ?? [],
        requiredMaterials: data.requiredMaterials ?? [],
        status: COURSE_STATUS.DRAFT
    };
}