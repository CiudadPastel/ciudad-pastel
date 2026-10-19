import { ENROLLMENT_STATUS } from "../models/enrollment.model.js";
import { validateEnrollmentRequestInput } from "./enrollment-request.validator.js";

export const ENROLLMENT_LIMITS = Object.freeze({
    note: { max: 500 }
});

const PERSON_FIELDS = ["fullName", "idType", "idNumber", "phone"];

// Optional administrative note, e.g. "Pagó por SINPE". Empty becomes null.
function validateNote(value, errors) {
    if (value === undefined || value === null) return null;

    if (typeof value !== "string") {
        errors.push("note must be a text string.");
        return null;
    }

    const note = value.trim();
    if (note.length > ENROLLMENT_LIMITS.note.max) {
        errors.push(`note must not exceed ${ENROLLMENT_LIMITS.note.max} characters.`);
        return null;
    }

    return note || null;
}

/**
 * Validates a manual enrollment: same person rules as an enrollment request
 * (national ID 9 digits starting 1-7, DIMEX 11-12 digits, phone 8 digits),
 * plus an optional note. ID number and phone are stored without dashes or spaces.
 */
export function validateEnrollmentInput(input) {
    const person = validateEnrollmentRequestInput(input);
    const errors = [...person.errors];
    const note = input && typeof input === "object" && !Array.isArray(input)
        ? validateNote(input.note, errors)
        : null;

    if (errors.length > 0) {
        return { valid: false, errors, data: null };
    }

    return { valid: true, errors: [], data: { ...person.data, note } };
}

/**
 * Validates the body to confirm a request. The request already has the
 * person's data; the administrator may correct any of it and add a note.
 */
export function validateConfirmRequestInput(input, request) {
    const body = input && typeof input === "object" && !Array.isArray(input) ? input : {};
    const merged = Object.fromEntries(
        PERSON_FIELDS.map((field) => [field, body[field] !== undefined ? body[field] : request[field]])
    );

    return validateEnrollmentInput({ ...merged, note: body.note });
}

/**
 * Validates a partial update (PATCH): correct the person's data, change the
 * note, or change the status (enrolled / cancelled). At least one field.
 */
export function validateEnrollmentUpdateInput(input, current) {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
        return { valid: false, errors: ["Enrollment update body must be a valid JSON object."], data: null };
    }

    const allowed = [...PERSON_FIELDS, "note", "status"];
    if (!allowed.some((field) => input[field] !== undefined)) {
        return { valid: false, errors: [`Send at least one of: ${allowed.join(", ")}.`], data: null };
    }

    const errors = [];
    const changes = {};

    if (PERSON_FIELDS.some((field) => input[field] !== undefined)) {
        const merged = Object.fromEntries(
            PERSON_FIELDS.map((field) => [field, input[field] !== undefined ? input[field] : current[field]])
        );
        const person = validateEnrollmentRequestInput(merged);
        errors.push(...person.errors);
        if (person.valid) Object.assign(changes, person.data);
    }

    if (input.note !== undefined) {
        changes.note = validateNote(input.note, errors);
    }

    if (input.status !== undefined) {
        const statuses = Object.values(ENROLLMENT_STATUS);
        if (!statuses.includes(input.status)) {
            errors.push(`status must be one of: ${statuses.join(", ")}.`);
        } else {
            changes.status = input.status;
        }
    }

    return errors.length > 0
        ? { valid: false, errors, data: null }
        : { valid: true, errors: [], data: changes };
}

// Validates ?status= on the course enrollment list.
export function validateEnrollmentListFilters(query = {}) {
    if (query.status === undefined) return { valid: true, errors: [], data: {} };

    const statuses = Object.values(ENROLLMENT_STATUS);
    return statuses.includes(query.status)
        ? { valid: true, errors: [], data: { status: query.status } }
        : { valid: false, errors: [`status must be one of: ${statuses.join(", ")}.`], data: null };
}
