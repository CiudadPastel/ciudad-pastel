// Contenido administrable de la portada. No se permite HTML ni URLs no HTTPS.
export const HOME_DEFAULTS = Object.freeze({
    heroImageUrl: "https://images.unsplash.com/photo-1578985545062-69928b1d9587?w=1400&q=85",
    storeImageUrl: "https://images.unsplash.com/photo-1499636136210-6f4ee915583e?w=1400&q=85",
    about: { visible: false, title: "Sobre nosotros", description: "", imageUrl: null }
});

function plainObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

function cleanImageUrl(value, field, errors) {
    if (value === null || value === undefined || value === "") return null;
    if (typeof value !== "string" || value.trim().length > 1000) {
        errors.push(`${field} debe ser una URL HTTPS de hasta 1000 caracteres.`);
        return null;
    }
    const text = value.trim();
    if (!text) return null;
    try {
        const url = new URL(text);
        if (url.protocol !== "https:" || !url.hostname || url.username || url.password) {
            throw new Error("Invalid URL");
        }
        return text;
    } catch {
        errors.push(`${field} debe ser una URL HTTPS válida y pública.`);
        return null;
    }
}

export function validateHomeContent(input) {
    const errors = [];
    if (!plainObject(input)) return { valid: false, errors: ["El contenido debe ser un objeto."], data: null };
    const about = input.about;
    if (!plainObject(about)) {
        return { valid: false, errors: ["about debe ser un objeto."], data: null };
    }
    const title = typeof about.title === "string" ? about.title.trim() : "";
    const description = typeof about.description === "string" ? about.description.trim() : "";
    if (title.length > 100 || (about.visible && !title)) errors.push("about.title debe tener entre 1 y 100 caracteres cuando está visible.");
    if (typeof about.title !== "string") errors.push("about.title debe ser texto.");
    if (typeof about.description !== "string" || description.length > 2500) errors.push("about.description debe ser texto de hasta 2500 caracteres.");
    if (typeof about.visible !== "boolean") errors.push("about.visible debe ser booleano.");
    if (about.visible && !description) errors.push("about.description es obligatorio cuando la sección está visible.");

    const data = {
        heroImageUrl: cleanImageUrl(input.heroImageUrl, "heroImageUrl", errors),
        storeImageUrl: cleanImageUrl(input.storeImageUrl, "storeImageUrl", errors),
        about: {
            visible: about.visible === true,
            title,
            description,
            imageUrl: cleanImageUrl(about.imageUrl, "about.imageUrl", errors)
        }
    };
    return { valid: errors.length === 0, data: errors.length === 0 ? data : null, errors };
}

// Lecturas públicas tolerantes a documentos antiguos o incompletos.
export function normalizeHomeContent(value) {
    if (!plainObject(value)) return structuredClone(HOME_DEFAULTS);
    const about = plainObject(value.about) ? value.about : {};
    const errors = [];
    const title = typeof about.title === "string" && about.title.trim() ? about.title.trim().slice(0, 100) : HOME_DEFAULTS.about.title;
    const description = typeof about.description === "string" ? about.description.trim().slice(0, 2500) : "";
    return {
        heroImageUrl: cleanImageUrl(value.heroImageUrl, "heroImageUrl", errors),
        storeImageUrl: cleanImageUrl(value.storeImageUrl, "storeImageUrl", errors),
        about: {
            visible: about.visible === true && Boolean(description),
            title,
            description,
            imageUrl: cleanImageUrl(about.imageUrl, "about.imageUrl", errors)
        }
    };
}
