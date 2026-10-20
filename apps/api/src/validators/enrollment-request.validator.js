import {
    ENROLLMENT_REQUEST_STATUS,
    ID_TYPE,
    MANUAL_ENROLLMENT_REQUEST_STATUSES
} from "../models/enrollment-request.model.js";

export const ENROLLMENT_REQUEST_LIMITS = Object.freeze({
    fullName: { min: 3, max: 120 },
    phone: { digits: 8 },
    idNumber: {
        [ID_TYPE.NATIONAL]: { digits: [9] },
        [ID_TYPE.DIMEX]: { digits: [11, 12] }
    }
});

// Costa Rican national ID: 9 digits and the first one is the province (1-7).
const NATIONAL_ID_REGEX = /^[1-7]\d{8}$/;
// DIMEX (resident ID): 11 or 12 digits.
const DIMEX_REGEX = /^\d{11,12}$/;
// Costa Rican phone numbers have exactly 8 digits.
const PHONE_REGEX = /^\d{8}$/;

// Removes spaces, hyphens and any other non-digit character.
export function normalizeDigits(value) {
    if (typeof value !== "string" && typeof value !== "number") {
        return "";
    }
    return String(value).replace(/\D/g, "");
}

// Kept for compatibility with earlier code and tests.
export const normalizePhone = (phone) => (typeof phone === "string" ? normalizeDigits(phone) : "");

function isBlank(value) {
    return value === undefined || value === null || (typeof value === "string" && !value.trim());
}

// Validates the visitor's request. The course comes from the URL, not from the body.
// Only fullName, idType, idNumber and phone are accepted; any other field is ignored.
export function validateEnrollmentRequestInput(input) {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
        return {
            valid: false,
            errors: ["Enrollment request body must be a valid JSON object."],
            data: null
        };
    }

    const errors = [];

    // 1. Full name
    let fullName = null;
    if (isBlank(input.fullName)) {
        errors.push("fullName is required.");
    } else if (typeof input.fullName !== "string") {
        errors.push("fullName must be a text string.");
    } else {
        fullName = input.fullName.trim().replace(/\s+/g, " ");
        if (fullName.length < ENROLLMENT_REQUEST_LIMITS.fullName.min) {
            errors.push(`fullName must contain at least ${ENROLLMENT_REQUEST_LIMITS.fullName.min} characters.`);
        } else if (fullName.length > ENROLLMENT_REQUEST_LIMITS.fullName.max) {
            errors.push(`fullName must not exceed ${ENROLLMENT_REQUEST_LIMITS.fullName.max} characters.`);
        }
    }

    // 2. ID type and number
    const idType = input.idType;
    const validIdType = Object.values(ID_TYPE).includes(idType);
    if (isBlank(idType)) {
        errors.push("idType is required.");
    } else if (!validIdType) {
        errors.push(`idType must be one of: ${Object.values(ID_TYPE).join(", ")}.`);
    }

    const idNumber = normalizeDigits(input.idNumber);
    if (isBlank(input.idNumber)) {
        errors.push("idNumber is required.");
    } else if (typeof input.idNumber !== "string") {
        errors.push("idNumber must be a text string.");
    } else if (validIdType && idType === ID_TYPE.NATIONAL && !NATIONAL_ID_REGEX.test(idNumber)) {
        errors.push("idNumber must have 9 digits and start with a province number from 1 to 7 for a national ID.");
    } else if (validIdType && idType === ID_TYPE.DIMEX && !DIMEX_REGEX.test(idNumber)) {
        errors.push("idNumber must have 11 or 12 digits for a DIMEX.");
    }

    // 3. Phone
    const phone = normalizeDigits(input.phone);
    if (isBlank(input.phone)) {
        errors.push("phone is required.");
    } else if (typeof input.phone !== "string") {
        errors.push("phone must be a text string.");
    } else if (!PHONE_REGEX.test(phone)) {
        errors.push(`phone must have exactly ${ENROLLMENT_REQUEST_LIMITS.phone.digits} digits.`);
    }

    if (errors.length > 0) {
        return { valid: false, errors, data: null };
    }

    return {
        valid: true,
        errors: [],
        data: { fullName, idType, idNumber, phone }
    };
}

// Validates the administrative status change body ({ status }).
// "confirmed" is not accepted here: it is set by the confirm endpoint (HU-A09).
export function validateEnrollmentStatusInput(input) {
    const statuses = MANUAL_ENROLLMENT_REQUEST_STATUSES;

    if (!input || typeof input !== "object" || Array.isArray(input) || !statuses.includes(input.status)) {
        return {
            valid: false,
            errors: [`status must be one of: ${statuses.join(", ")}.`],
            data: null
        };
    }

    return { valid: true, errors: [], data: { status: input.status } };
}

// Validates the optional list filters (?courseId=&status=).
export function validateEnrollmentListFilters(query = {}) {
    const errors = [];
    const statuses = Object.values(ENROLLMENT_REQUEST_STATUS);
    const filters = {};

    if (query.status !== undefined) {
        if (!statuses.includes(query.status)) {
            errors.push(`status must be one of: ${statuses.join(", ")}.`);
        } else {
            filters.status = query.status;
        }
    }

    if (query.courseId !== undefined) {
        if (typeof query.courseId !== "string" || !query.courseId.trim()) {
            errors.push("courseId must be a non-empty text string.");
        } else {
            filters.courseId = query.courseId.trim();
        }
    }

    return errors.length > 0
        ? { valid: false, errors, data: null }
        : { valid: true, errors: [], data: filters };
}
