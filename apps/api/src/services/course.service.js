import { randomUUID } from "node:crypto";

import {
    buildCourse,
    courseCalendarDate,
    COURSE_STATUS,
    isCoursePubliclyAvailable,
    normalizeCourseInstructor,
    toPublicCourse
} from "../models/course.model.js";
import { normalizeSearchText } from "../utils/search-text.js";
import { validateCourseFilters } from "../validators/course-filter.validator.js";
import { isValidIsoDate, validateCourseInput } from "../validators/course.validator.js";

import { countActiveEnrollmentsByCourse } from "../repositories/enrollment.repository.js";

import {
    createCourse as createCourseRepository,
    getCourses as getCoursesRepository,
    getCourseById as getCourseByIdRepository,
    updateCourse as updateCourseRepository,
    updateCourseStatus as updateCourseStatusRepository,
    withdrawCourseSeason as withdrawCourseSeasonRepository
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

function sortCoursesBySchedule(a, b) {
    const aDate = a.schedule?.startDate;
    const bDate = b.schedule?.startDate;

    if (aDate && bDate) {
        const dateComparison = aDate.localeCompare(bDate);
        if (dateComparison !== 0) return dateComparison;
    }
    if (aDate && !bDate) return -1;
    if (!aDate && bDate) return 1;

    const nameComparison = a.name.localeCompare(b.name);
    if (nameComparison !== 0) return nameComparison;
    if (a.id === b.id) return 0;
    return a.id < b.id ? -1 : 1;
}

async function getAvailableCourses() {
    const courses = await getCoursesRepository(COURSE_STATUS.PUBLISHED);
    const today = courseCalendarDate();
    return courses.filter((course) => isCoursePubliclyAvailable(course, today));
}

function isValidFilterPrice(price) {
    return Number.isSafeInteger(price) && price >= 0;
}

function matchesCourseFilters(course, { words, instructor, minPrice, maxPrice, from, to }) {
    if (instructor !== undefined && normalizeCourseInstructor(course.instructor) !== instructor) return false;

    if (minPrice !== undefined || maxPrice !== undefined) {
        const { price } = course;
        if (!isValidFilterPrice(price) || price < (minPrice ?? 0) || price > (maxPrice ?? Number.MAX_SAFE_INTEGER)) {
            return false;
        }
    }

    if (from !== undefined || to !== undefined) {
        const startDate = course.schedule?.startDate;
        if (!isValidIsoDate(startDate) || (from && startDate < from) || (to && startDate > to)) return false;
    }

    if (!words) return true;
    const text = [course.name, course.summary, course.description].map(normalizeSearchText).join(" ");
    return words.every((word) => text.includes(word));
}

async function listPublicCourses(matches) {
    const [courses, activeByCourse] = await Promise.all([
        getAvailableCourses(),
        countActiveEnrollmentsByCourse()
    ]);

    return courses
        .filter(matches)
        .map((course) => toPublicCourse(course, activeByCourse.get(course.id) ?? 0))
        .sort(sortCoursesBySchedule);
}

export async function getPublishedCourses(query = new URLSearchParams()) {
    const filters = validateCourseFilters(query);
    return listPublicCourses((course) => matchesCourseFilters(course, filters));
}

export async function getSeasonalCourses() {
    return listPublicCourses((course) => course.seasonName != null);
}

export async function getCourseFilterOptions() {
    const courses = await getAvailableCourses();
    const instructorsByName = new Map();
    let min = null;
    let max = null;

    for (const { instructor, price } of courses) {
        const key = normalizeCourseInstructor(instructor);
        if (key) {
            const label = instructor.trim();
            const existing = instructorsByName.get(key);
            if (existing === undefined || label < existing) instructorsByName.set(key, label);
        }

        if (isValidFilterPrice(price)) {
            min = min === null ? price : Math.min(min, price);
            max = max === null ? price : Math.max(max, price);
        }
    }

    return {
        instructors: [...instructorsByName.values()].sort((a, b) => a.localeCompare(b, "es-CR")),
        priceRange: { min, max }
    };
}

// Retrieves a single published course by its identifier.
export async function getPublishedCourseById(id) {
    const course = await getCourseByIdRepository(id);

    if (!course || course.status !== COURSE_STATUS.PUBLISHED) {
        const error = new Error("Course not found.");
        error.name = "NotFoundError";
        throw error;
    }

    const activeByCourse = await countActiveEnrollmentsByCourse();

    return toPublicCourse(course, activeByCourse.get(course.id) ?? 0);
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

// Withdraws the seasonal campaign designation from a course (HU-A08).
export async function withdrawSeasonalPublication(id) {
    const course = await withdrawCourseSeasonRepository(id);

    if (!course) {
        const error = new Error("Course not found.");
        error.name = "NotFoundError";
        throw error;
    }

    return course;
}
