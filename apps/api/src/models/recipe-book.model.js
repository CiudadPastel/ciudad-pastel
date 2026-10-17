import crypto from "node:crypto";

// Creates a normalized recipe book object ready for repository persistence.
export function buildRecipeBook({
    id = crypto.randomUUID(),
    courseId,
    title,
    fileName,
    sizeBytes,
    createdBy
}) {
    return {
        id,
        courseId,
        title,
        fileName,
        contentType: "application/pdf",
        sizeBytes,
        createdBy: createdBy ?? null
    };
}
