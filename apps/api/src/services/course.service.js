import { randomUUID } from "node:crypto";

import { buildCourse } from "../models/course.model.js";

import {
    validateCourseInput
} from "../validators/course.validator.js";

import {
    createCourse as createCourseRepository
} from "../repositories/course.repository.js";


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