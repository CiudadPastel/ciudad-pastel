const COURSE_LIMITS = {
    name: {
        min: 3,
        max: 120
    },

    summary: {
        min: 10,
        max: 240
    },

    description: {
        min: 20,
        max: 5000
    },

    learningOutcomes: {
        maxItems: 15,
        maxLength: 200
    },

    requiredMaterials: {
        maxItems: 30,
        maxLength: 150
    }
};

// Validates a required string and returns its trimmed value.
function validateRequiredString(
    value,
    fieldName,
    minLength,
    maxLength,
    errors
) {
    if (typeof value !== "string") {
        errors.push(
            `${fieldName} must be a string.`
        );

        return "";
    }

    const normalizedValue = value.trim();

    if (normalizedValue.length < minLength) {
        errors.push(
            `${fieldName} must contain at least ${minLength} characters.`
        );
    }

    if (normalizedValue.length > maxLength) {
        errors.push(
            `${fieldName} must not exceed ${maxLength} characters.`
        );
    }

    return normalizedValue;
}

// Validates an optional HTTP or HTTPS image URL.
function validateOptionalUrl(value, errors) {
    if (
        value === undefined ||
        value === null ||
        value === ""
    ) {
        return null;
    }

    if (typeof value !== "string") {
        errors.push(
            "imageUrl must be a string or null."
        );

        return null;
    }

    const normalizedUrl = value.trim();

    try {
        const url = new URL(normalizedUrl);

        if (
            url.protocol !== "http:" &&
            url.protocol !== "https:"
        ) {
            errors.push(
                "imageUrl must use HTTP or HTTPS."
            );

            return null;
        }

        return normalizedUrl;
    } catch {
        errors.push(
            "imageUrl must be a valid URL."
        );

        return null;
    }
}

// Validates and normalizes an optional array of strings.
function validateStringArray(
    value,
    fieldName,
    maxItems,
    maxItemLength,
    errors
) {
    if (
        value === undefined ||
        value === null
    ) {
        return [];
    }

    if (!Array.isArray(value)) {
        errors.push(
            `${fieldName} must be an array.`
        );

        return [];
    }

    if (value.length > maxItems) {
        errors.push(
            `${fieldName} must not contain more than ${maxItems} items.`
        );
    }

    const normalizedValues = [];

    value.forEach((item, index) => {
        if (typeof item !== "string") {
            errors.push(
                `${fieldName}[${index}] must be a string.`
            );

            return;
        }

        const normalizedItem = item.trim();

        if (!normalizedItem) {
            errors.push(
                `${fieldName}[${index}] must not be empty.`
            );

            return;
        }

        if (normalizedItem.length > maxItemLength) {
            errors.push(
                `${fieldName}[${index}] must not exceed ${maxItemLength} characters.`
            );

            return;
        }

        normalizedValues.push(normalizedItem);
    });

    return normalizedValues;
}

// Validates and normalizes the data required to create a course.
export function validateCourseInput(input = {}) {
    const errors = [];

    const name = validateRequiredString(
        input.name,
        "name",
        COURSE_LIMITS.name.min,
        COURSE_LIMITS.name.max,
        errors
    );

    const summary = validateRequiredString(
        input.summary,
        "summary",
        COURSE_LIMITS.summary.min,
        COURSE_LIMITS.summary.max,
        errors
    );

    const description = validateRequiredString(
        input.description,
        "description",
        COURSE_LIMITS.description.min,
        COURSE_LIMITS.description.max,
        errors
    );

    const imageUrl = validateOptionalUrl(
        input.imageUrl,
        errors
    );

    const learningOutcomes =
        validateStringArray(
            input.learningOutcomes,
            "learningOutcomes",
            COURSE_LIMITS.learningOutcomes.maxItems,
            COURSE_LIMITS.learningOutcomes.maxLength,
            errors
        );

    const requiredMaterials =
        validateStringArray(
            input.requiredMaterials,
            "requiredMaterials",
            COURSE_LIMITS.requiredMaterials.maxItems,
            COURSE_LIMITS.requiredMaterials.maxLength,
            errors
        );

    return {
        valid: errors.length === 0,

        errors,

        data: {
            name,
            summary,
            description,
            imageUrl,
            learningOutcomes,
            requiredMaterials
        }
    };
}