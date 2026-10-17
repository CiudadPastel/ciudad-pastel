import { randomUUID } from "node:crypto";

import { buildCourse, COURSE_STATUS, toPublicCourse } from "../models/course.model.js";

import {
    validateCourseInput
} from "../validators/course.validator.js";

import {
    createCourse as createCourseRepository,
    getCourses as getCoursesRepository,
    getCourseById as getCourseByIdRepository,
    updateCourse as updateCourseRepository,
    updateCourseStatus as updateCourseStatusRepository
} from "../repositories/course.repository.js";

const COURSE_STATUS_TRANSITIONS = {
    [COURSE_STATUS.DRAFT]: [COURSE_STATUS.PUBLISHED, COURSE_STATUS.ARCHIVED],
    [COURSE_STATUS.PUBLISHED]: [COURSE_STATUS.DRAFT, COURSE_STATUS.ARCHIVED],
    [COURSE_STATUS.ARCHIVED]: [COURSE_STATUS.DRAFT]
};

// Publication requires only a valid price; zero means a free course.
function validatePublicationPrice(course) {
    if (course.price == null || !Number.isInteger(course.price) || course.price < 0) {
        const error = new Error("Course publication validation failed.");
        error.name = "ValidationError";
        error.details = [course.price == null
            ? "price is required for a published course."
            : "price must be a non-negative whole number for a published course."];
        throw error;
    }
}

// Lists only published courses for public access, sorted by schedule start date ascending and then by name.
export async function getPublishedCourses() {
    const courses = await getCoursesRepository(COURSE_STATUS.PUBLISHED);

    return courses
        .map(toPublicCourse)
        .sort((a, b) => {
            const aDate = a.schedule?.startDate;
            const bDate = b.schedule?.startDate;

            if (aDate && bDate) {
                const dateComparison = aDate.localeCompare(bDate);
                if (dateComparison !== 0) return dateComparison;
                return a.name.localeCompare(b.name);
            }
            if (aDate && !bDate) return -1;
            if (!aDate && bDate) return 1;

            return a.name.localeCompare(b.name);
        });
}

// Retrieves a single published course by its identifier.
export async function getPublishedCourseById(id) {
    const course = await getCourseByIdRepository(id);

    if (!course || course.status !== COURSE_STATUS.PUBLISHED) {
        const error = new Error("Course not found.");
        error.name = "NotFoundError";
        throw error;
    }

    return toPublicCourse(course);
}

// Validates the target status and enforces allowed transitions.
export async function updateCourseStatus(id, input) {
    const status = input?.status;

    if (
        !input ||
        typeof input !== "object" ||
        Array.isArray(input) ||
        !Object.values(COURSE_STATUS).includes(status)
    ) {
        const error = new Error("Course status validation failed.");

        error.name = "ValidationError";
        error.details = [
            `status must be one of: ${Object.values(COURSE_STATUS).join(", ")}.`
        ];

        throw error;
    }

    const course = await updateCourseStatusRepository(id, status, (currentStatus, currentCourse) => {
        if (!COURSE_STATUS_TRANSITIONS[currentStatus]?.includes(status)) {
            const error = new Error(
                `Cannot change course status from ${currentStatus} to ${status}.`
            );

            error.name = "InvalidTransitionError";

            throw error;
        }

        if (status === COURSE_STATUS.PUBLISHED) {
            validatePublicationPrice(currentCourse);
        }
    });

    if (!course) {
        const error = new Error("Course not found.");

        error.name = "NotFoundError";

        throw error;
    }

    return course;
}

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


// Validates and replaces the editable course information.
export async function updateCourse(id, input) {
    const validation = validateCourseInput(input ?? {});

    if (!validation.valid) {
        const error = new Error("Course validation failed.");

        error.name = "ValidationError";
        error.details = validation.errors;

        throw error;
    }

    if (validation.data.price == null) {
        const currentCourse = await getCourseByIdRepository(id);
        if (currentCourse?.status === COURSE_STATUS.PUBLISHED) {
            validatePublicationPrice(validation.data);
        }
    }

    const course = await updateCourseRepository(id, validation.data);

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
