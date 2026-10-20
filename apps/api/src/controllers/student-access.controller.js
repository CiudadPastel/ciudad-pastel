import { getStudentRecipeBookFile, STUDENT_VERIFICATION_FAILURE, verifyStudentAccess } from "../services/student-access.service.js";

export async function getStudentRecipeBook(req, res) {
    try {
        const { fileName, buffer } = await getStudentRecipeBookFile(
            req.params.courseId, req.params.recipeBookId, req.studentAccess
        );
        const asciiName = fileName.replace(/[^\x20-\x7E]/g, "_").replace(/["\\]/g, "\\$&");
        const encodedName = encodeURIComponent(fileName).replace(/['()*]/g, (char) =>
            `%${char.charCodeAt(0).toString(16).toUpperCase()}`
        );
        const unicodeName = /[^\x20-\x7E]/.test(fileName) ? `; filename*=UTF-8''${encodedName}` : "";
        res.set({
            "Content-Disposition": `inline; filename="${asciiName}"${unicodeName}`,
            "Content-Type": "application/pdf",
            "Content-Length": String(buffer.length),
            "X-Content-Type-Options": "nosniff"
        });
        return res.status(200).send(buffer);
    } catch (error) {
        if (error.name === "StudentAccessForbiddenError") {
            return res.status(403).json({ message: "Student access is not authorized for this course." });
        }
        if (error.name === "NotFoundError") {
            return res.status(404).json({ message: "Recipe book not found." });
        }
        return res.status(500).json({ message: "Could not retrieve recipe book." });
    }
}

export function handleStudentAccessBodyError(error, req, res, next) {
    if (error.type === "entity.parse.failed" || error.type === "entity.too.large") {
        return res.status(400).json({
            message: "Student verification validation failed.",
            errors: ["Student verification body must be a valid JSON object within 100 KB."]
        });
    }
    return next(error);
}

export async function verifyStudent(req, res) {
    try {
        return res.status(200).json(await verifyStudentAccess(req.body));
    } catch (error) {
        if (error.name === "ValidationError") {
            return res.status(400).json({ message: error.message, errors: error.details });
        }
        if (error.name === "StudentVerificationError") {
            return res.status(401).json({ message: STUDENT_VERIFICATION_FAILURE });
        }
        return res.status(500).json({ message: "Could not verify student access." });
    }
}
