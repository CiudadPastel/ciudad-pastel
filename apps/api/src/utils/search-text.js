// Search text normalization for the public catalog (HU-T03).
// Lowercases, removes accents/diacritics ("Jabón" -> "jabon", "piña" -> "pina")
// and turns punctuation into spaces, so the comparison ignores all of them.
export function normalizeSearchText(value) {
    if (typeof value !== "string") return "";

    return value
        .normalize("NFD")
        .replace(/\p{M}/gu, "")
        .toLowerCase()
        .replace(/[^\p{L}\p{N}]+/gu, " ")
        .trim();
}

export const MIN_SEARCH_LENGTH = 2;
export const MAX_SEARCH_LENGTH = 100;

// Returns the normalized search words, or null when the search must be ignored
// (missing, or shorter than MIN_SEARCH_LENGTH characters once normalized).
export function toSearchTerms(query) {
    const normalized = normalizeSearchText(query);
    if (normalized.length < MIN_SEARCH_LENGTH) return null;

    return { normalized, words: normalized.split(" ") };
}
