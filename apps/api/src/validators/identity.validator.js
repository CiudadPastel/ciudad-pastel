/**
 * Identity and phone normalizers and validators for student lookup (HU-A07).
 */

// Normalizes national ID: removes spaces and hyphens.
export function normalizeNationalId(value) {
    if (typeof value !== "string" && typeof value !== "number") {
        return "";
    }
    return String(value).replace(/[\s-]/g, "");
}

// Normalizes phone: removes spaces, hyphens, parentheses, and leading plus.
export function normalizePhone(value) {
    if (typeof value !== "string" && typeof value !== "number") {
        return "";
    }
    let str = String(value).trim();
    if (str.startsWith("+")) {
        str = str.slice(1);
    }
    return str.replace(/[\s\-()]/g, "");
}

/**
 * Validates the body for student payment status lookup.
 * Requires both nationalId and phone.
 */
export function validatePaymentStatusLookupInput(input) {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
        return {
            valid: false,
            errors: ["Payment status lookup body must be a valid JSON object."],
            data: null
        };
    }

    const errors = [];
    const rawId = input.nationalId !== undefined ? input.nationalId : input.idNumber;
    const rawPhone = input.phone;

    // Validate nationalId
    if (rawId === undefined || rawId === null || (typeof rawId === "string" && !rawId.trim())) {
        errors.push("nationalId is required.");
    } else {
        const normalizedId = normalizeNationalId(rawId);
        if (!/^\d+$/.test(normalizedId)) {
            errors.push("nationalId must contain only digits, spaces, or hyphens.");
        } else if (normalizedId.length !== 9 && normalizedId.length !== 11 && normalizedId.length !== 12) {
            errors.push("nationalId must have 9 digits (national) or 11-12 digits (residence).");
        }
    }

    // Validate phone
    if (rawPhone === undefined || rawPhone === null || (typeof rawPhone === "string" && !rawPhone.trim())) {
        errors.push("phone is required.");
    } else {
        const normalizedPhone = normalizePhone(rawPhone);
        if (!/^\d+$/.test(normalizedPhone)) {
            errors.push("phone must contain only digits, spaces, hyphens, parentheses, or a leading plus.");
        } else if (normalizedPhone.length < 8 || normalizedPhone.length > 15) {
            errors.push("phone must have between 8 and 15 digits.");
        }
    }

    if (errors.length > 0) {
        return { valid: false, errors, data: null };
    }

    return {
        valid: true,
        errors: [],
        data: {
            nationalId: normalizeNationalId(rawId),
            phone: normalizePhone(rawPhone)
        }
    };
}
