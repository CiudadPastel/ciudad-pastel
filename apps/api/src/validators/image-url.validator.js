// Validates an optional image URL, checking string length and http/https protocol.
export function validateOptionalImageUrl(value, fieldName = "imageUrl", errors = []) {
    if (value === undefined || value === null || (typeof value === "string" && !value.trim())) {
        return null;
    }

    if (typeof value !== "string") {
        errors.push(`${fieldName} must be a text URL.`);
        return null;
    }

    const trimmed = value.trim();

    if (trimmed.length > 500) {
        errors.push(`${fieldName} must not exceed 500 characters.`);
        return null;
    }

    try {
        const parsed = new URL(trimmed);
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
            errors.push(`${fieldName} must be a valid http or https URL.`);
            return null;
        }
        return trimmed;
    } catch {
        errors.push(`${fieldName} must be a valid http or https URL.`);
        return null;
    }
}

// Sanitizes an image URL for safe public rendering, returning the URL if valid and null otherwise.
export function sanitizeImageUrl(value) {
    if (!value || typeof value !== "string") {
        return null;
    }

    const trimmed = value.trim();
    if (!trimmed || trimmed.length > 500) {
        return null;
    }

    try {
        const parsed = new URL(trimmed);
        if (parsed.protocol === "http:" || parsed.protocol === "https:") {
            return trimmed;
        }
        return null;
    } catch {
        return null;
    }
}

