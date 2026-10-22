import { validateOptionalImageUrl } from "./image-url.validator.js";

export const PRODUCT_LIMITS = Object.freeze({
    product: {
        name: { min: 3, max: 120 },
        description: { max: 1000 },
        price: { min: 1, max: 10_000_000 },
        imageUrl: { max: 500 }
    },
    category: {
        name: { min: 2, max: 60 }
    }
});

// Validates product input and strips internal/protected fields.
export function validateProductInput(input) {
    const errors = [];

    if (!input || typeof input !== "object" || Array.isArray(input)) {
        return {
            valid: false,
            errors: ["Product body must be a valid JSON object."],
            data: null
        };
    }

    // 1. Name validation
    const rawName = typeof input.name === "string" ? input.name.trim() : "";
    if (!rawName) {
        errors.push("name is required.");
    } else if (rawName.length < PRODUCT_LIMITS.product.name.min) {
        errors.push(`name must contain at least ${PRODUCT_LIMITS.product.name.min} characters.`);
    } else if (rawName.length > PRODUCT_LIMITS.product.name.max) {
        errors.push(`name must not exceed ${PRODUCT_LIMITS.product.name.max} characters.`);
    }

    // 2. Description validation (optional)
    let sanitizedDescription = null;
    if (input.description !== undefined && input.description !== null) {
        if (typeof input.description === "string") {
            const trimmedDesc = input.description.trim();
            if (trimmedDesc.length > PRODUCT_LIMITS.product.description.max) {
                errors.push(`description must not exceed ${PRODUCT_LIMITS.product.description.max} characters.`);
            } else if (trimmedDesc.length > 0) {
                sanitizedDescription = trimmedDesc;
            }
        } else {
            errors.push("description must be a text string.");
        }
    }

    // 3. Price validation (integer colones between 1 and 10,000,000)
    const price = input.price;
    if (price === undefined || price === null || typeof price !== "number" || !Number.isInteger(price)) {
        errors.push(`price must be an integer between ${PRODUCT_LIMITS.product.price.min} and ${PRODUCT_LIMITS.product.price.max}.`);
    } else if (price < PRODUCT_LIMITS.product.price.min || price > PRODUCT_LIMITS.product.price.max) {
        errors.push(`price must be an integer between ${PRODUCT_LIMITS.product.price.min} and ${PRODUCT_LIMITS.product.price.max}.`);
    }

    // 4. CategoryId validation
    const categoryId = typeof input.categoryId === "string" ? input.categoryId.trim() : "";
    if (!categoryId) {
        errors.push("categoryId is required.");
    }

    // 5. ImageUrl validation (optional)
    const imageUrl = validateOptionalImageUrl(input.imageUrl, "imageUrl", errors);

    // 6. Available validation (boolean, defaults to true)
    const available = input.available !== undefined ? Boolean(input.available) : true;

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
            name: rawName,
            description: sanitizedDescription,
            price,
            categoryId,
            imageUrl,
            available
        }
    };
}

// Validates category input and strips internal/protected fields.
export function validateCategoryInput(input) {
    const errors = [];

    if (!input || typeof input !== "object" || Array.isArray(input)) {
        return {
            valid: false,
            errors: ["Category body must be a valid JSON object."],
            data: null
        };
    }

    // 1. Name validation
    const rawName = typeof input.name === "string" ? input.name.trim() : "";
    if (!rawName) {
        errors.push("name is required.");
    } else if (rawName.length < PRODUCT_LIMITS.category.name.min) {
        errors.push(`name must contain at least ${PRODUCT_LIMITS.category.name.min} characters.`);
    } else if (rawName.length > PRODUCT_LIMITS.category.name.max) {
        errors.push(`name must not exceed ${PRODUCT_LIMITS.category.name.max} characters.`);
    }

    // 2. Order validation (integer >= 0, default 0)
    let order = 0;
    if (input.order !== undefined && input.order !== null) {
        if (typeof input.order !== "number" || !Number.isInteger(input.order) || input.order < 0) {
            errors.push("order must be a non-negative integer.");
        } else {
            order = input.order;
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
            name: rawName,
            order
        }
    };
}
