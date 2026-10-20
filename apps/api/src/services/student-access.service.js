import { findActiveEnrollments } from "./enrollment.service.js";
import { findRecipeBooksByCourse, getRecipeBookFileForCourse } from "./recipe-book.service.js";
import { getEnrollmentById } from "../repositories/enrollment.repository.js";
import { ENROLLMENT_STATUS } from "../models/enrollment.model.js";
import {
    assertStudentAccessTokenConfiguration,
    createStudentAccessToken,
    STUDENT_ACCESS_TOKEN_TTL_SECONDS
} from "./student-access-token.service.js";
import { validateStudentAccessInput } from "../validators/student-access.validator.js";

export const STUDENT_VERIFICATION_FAILURE = "We couldn't find an enrollment with this data.";

export async function getStudentRecipeBookFile(courseId, recipeBookId, claims) {
    const denyAccess = () => {
        const error = new Error("Student access is not authorized for this course.");
        error.name = "StudentAccessForbiddenError";
        throw error;
    };

    if (!claims.courseIds.includes(courseId)) denyAccess();

    const enrollments = await Promise.all(claims.enrollmentIds.map((id) => getEnrollmentById(id)));
    if (!enrollments.some((enrollment) => enrollment
        && enrollment.status === ENROLLMENT_STATUS.ENROLLED
        && enrollment.courseId === courseId)) denyAccess();

    return getRecipeBookFileForCourse(courseId, recipeBookId);
}

export async function verifyStudentAccess(input) {
    const validation = validateStudentAccessInput(input);
    if (!validation.valid) {
        const error = new Error("Student verification validation failed.");
        error.name = "ValidationError";
        error.details = validation.errors;
        throw error;
    }

    assertStudentAccessTokenConfiguration();

    const { idNumber, phone } = validation.data;
    const enrollments = await findActiveEnrollments({ idNumber, phone });
    if (!enrollments.length) {
        const error = new Error(STUDENT_VERIFICATION_FAILURE);
        error.name = "StudentVerificationError";
        throw error;
    }

    const uniqueCourses = new Map(enrollments.map((enrollment) => [enrollment.courseId, enrollment.courseName]));
    const available = await Promise.all([...uniqueCourses].map(async ([id, name]) => {
        const recipeBooks = await findRecipeBooksByCourse(id);
        return recipeBooks.length ? { id, name, recipeBooks } : null;
    }));
    const courses = available.filter(Boolean);
    const accessToken = createStudentAccessToken({
        enrollmentIds: enrollments.map((enrollment) => enrollment.id),
        courseIds: courses.map((course) => course.id)
    });

    return { accessToken, expiresIn: STUDENT_ACCESS_TOKEN_TTL_SECONDS, courses };
}
