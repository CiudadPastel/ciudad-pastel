export const ENROLLMENT_REQUEST_LIMITS = Object.freeze({
    fullName: { min: 3, max: 120 },
    email: { max: 254 },
    phone: { minDigits: 8, maxDigits: 15 },
    message: { max: 500 }
});

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Normalizes a phone input by stripping all non-digit characters.
export function normalizePhone(phone) {
    if (typeof phone !== "string") {
        return "";
    }
    return phone.replace(/\D/g, "");
}

// Validates incoming enrollment request input and extracts only client-allowed fields.
export function validateEnrollmentRequestInput(input) {
    const errors = [];

    if (!input || typeof input !== "object" || Array.isArray(input)) {
        return {
            valid: false,
            errors: ["Enrollment request body must be a valid JSON object."],
            data: null
        };
    }

    // 1. Course identifier validation
    const courseId = typeof input.courseId === "string" ? input.courseId.trim() : "";
    if (!courseId) {
        errors.push("courseId is required.");
    }

    // 2. Full name validation
    const rawFullName = typeof input.fullName === "string" ? input.fullName.trim() : "";
    if (!rawFullName) {
        errors.push("fullName is required.");
    } else if (rawFullName.length < ENROLLMENT_REQUEST_LIMITS.fullName.min) {
        errors.push(`fullName must contain at least ${ENROLLMENT_REQUEST_LIMITS.fullName.min} characters.`);
    } else if (rawFullName.length > ENROLLMENT_REQUEST_LIMITS.fullName.max) {
        errors.push(`fullName must not exceed ${ENROLLMENT_REQUEST_LIMITS.fullName.max} characters.`);
    }

    // 3. Email validation
    const rawEmail = typeof input.email === "string" ? input.email.trim() : "";
    if (!rawEmail) {
        errors.push("email is required.");
    } else if (rawEmail.length > ENROLLMENT_REQUEST_LIMITS.email.max) {
        errors.push(`email must not exceed ${ENROLLMENT_REQUEST_LIMITS.email.max} characters.`);
    } else if (!EMAIL_REGEX.test(rawEmail)) {
        errors.push("email must be a valid email address.");
    }

    // 4. Phone validation
    const normalizedPhone = normalizePhone(input.phone);
    if (!input.phone || typeof input.phone !== "string" || !input.phone.trim()) {
        errors.push("phone is required.");
    } else if (
        normalizedPhone.length < ENROLLMENT_REQUEST_LIMITS.phone.minDigits ||
        normalizedPhone.length > ENROLLMENT_REQUEST_LIMITS.phone.maxDigits
    ) {
        errors.push(
            `phone must contain between ${ENROLLMENT_REQUEST_LIMITS.phone.minDigits} and ${ENROLLMENT_REQUEST_LIMITS.phone.maxDigits} digits.`
        );
    }

    // 5. Message validation (optional)
    let sanitizedMessage = null;
    if (input.message !== undefined && input.message !== null) {
        if (typeof input.message === "string") {
            const trimmedMessage = input.message.trim();
            if (trimmedMessage.length > ENROLLMENT_REQUEST_LIMITS.message.max) {
                errors.push(`message must not exceed ${ENROLLMENT_REQUEST_LIMITS.message.max} characters.`);
            } else if (trimmedMessage.length > 0) {
                sanitizedMessage = trimmedMessage;
            }
        } else {
            errors.push("message must be a text string.");
        }
    }

    if (errors.length > 0) {
        return {
            valid: false,
            errors,
            data: null
        };
    }

    return {
        valid: true,
        errors: [],
        data: {
            courseId,
            fullName: rawFullName,
            email: rawEmail.toLowerCase(),
            phone: normalizedPhone,
            message: sanitizedMessage
        }
    };
}
