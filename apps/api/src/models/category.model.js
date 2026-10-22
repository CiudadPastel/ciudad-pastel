// Creates a normalized category entity.
export function buildCategory(data) {
    return {
        id: data.id,
        name: data.name,
        order: data.order ?? 0
    };
}
