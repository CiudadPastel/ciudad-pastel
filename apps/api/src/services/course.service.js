import { randomUUID } from "node:crypto";

import { buildCourse, COURSE_STATUS } from "../models/course.model.js";

import {
    validateCourseInput
} from "../validators/course.validator.js";

import {
    createCourse as createCourseRepository,
    getCourses as getCoursesRepository,
    getCourseById as getCourseByIdRepository
} from "../repositories/course.repository.js";

// Validates the optional status filter before reading courses.
export async function getCourses(status) {
    if (
        status !== undefined &&
        !Object.values(COURSE_STATUS).includes(status)
    ) {
        const error = new Error("Course status validation failed.");

        error.name = "ValidationError";
        error.details = [
            "status must be one of: draft, published, archived."
        ];

        throw error;
    }

    return getCoursesRepository(status);
}

// Returns a course or reports that it does not exist.
export async function getCourseById(id) {
    const course = await getCourseByIdRepository(id);

    if (!course) {
        const error = new Error("Course not found.");

        error.name = "NotFoundError";

        throw error;
    }

    return course;
}


// Validates the input and creates a new draft course.
export async function createCourse(input) {
    const validation = validateCourseInput(input);

    if (!validation.valid) {
        const error = new Error(
            "Course validation failed."
        );

        error.name = "ValidationError";
        error.details = validation.errors;

        throw error;
    }

    const course = buildCourse(
        validation.data
    );

    const courseWithId = {
        id: randomUUID(),
        ...course
    };

    return createCourseRepository(
        courseWithId
    );
}
