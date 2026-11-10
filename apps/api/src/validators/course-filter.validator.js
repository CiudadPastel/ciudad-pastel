import { normalizeCourseInstructor } from "../models/course.model.js";
import { MAX_SEARCH_LENGTH, normalizeSearchText } from "../utils/search-text.js";
import { isValidIsoDate } from "./course.validator.js";

const FILTER_NAMES = ["q", "instructor", "minPrice", "maxPrice", "from", "to"];
const MAX_INSTRUCTOR_LENGTH = 120;

// Read all query values to catch repeats and bracket notation without Express's parser limits.
export function validateCourseFilters(query) {
    const filters = {};
    const errors = [];
    const keys = [...query.keys()];

    for (const name of FILTER_NAMES) {
        const values = query.getAll(name);
        if (values.length > 1 || keys.some((key) => key.startsWith(`${name}[`))) {
            errors.push(`${name} must be provided as a single value.`);
            continue;
        }
        if (values.length === 0) continue;
        const [value] = values;

        switch (name) {
            case "q": {
                const normalized = normalizeSearchText(value);
                if (!normalized || value.length > MAX_SEARCH_LENGTH) {
                    errors.push(`q must contain letters or digits and be at most ${MAX_SEARCH_LENGTH} characters.`);
                } else {
                    filters.words = normalized.split(" ");
                }
                break;
            }
            case "instructor": {
                const normalized = normalizeCourseInstructor(value);
                if (!normalized || value.trim().length > MAX_INSTRUCTOR_LENGTH) {
                    errors.push(`instructor must be non-empty and at most ${MAX_INSTRUCTOR_LENGTH} characters after trimming.`);
                } else {
                    filters.instructor = normalized;
                }
                break;
            }
            case "minPrice":
            case "maxPrice": {
                const price = Number(value);
                if (!/^\d+$/.test(value) || !Number.isSafeInteger(price)) {
                    errors.push(`${name} must be a non-negative safe integer in colones.`);
                } else {
                    filters[name] = price;
                }
                break;
            }
            default:
                if (!isValidIsoDate(value)) {
                    errors.push(`${name} must be a valid date in YYYY-MM-DD format.`);
                } else {
                    filters[name] = value;
                }
        }
    }

    if (filters.minPrice !== undefined && filters.maxPrice !== undefined && filters.minPrice > filters.maxPrice) {
        errors.push("minPrice must not exceed maxPrice.");
    }
    if (filters.from && filters.to && filters.from > filters.to) {
        errors.push("from must not be later than to.");
    }

    if (errors.length) {
        const error = new Error("Course filter validation failed.");
        error.name = "ValidationError";
        error.details = errors;
        throw error;
    }

    return filters;
}
