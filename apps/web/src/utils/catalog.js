// Courses API returns the complete published list, so these totals are filtered
// totals of that full response, never the length of a page.
export function courseCategories(courses, types) {
    const categories = types.filter((type) => courses.some((course) => course.courseType === type.value))
        .map((type) => ({ id: type.value, name: type.label }));
    if (courses.some((course) => !course.courseType)) categories.push({ id: "sin-tipo", name: "Sin tipo" });
    return categories;
}

export function filterCourses(courses, type) {
    if (!type) return courses;
    return courses.filter((course) => type === "sin-tipo" ? !course.courseType : course.courseType === type);
}

export function incrementalItems(items, requestedBlocks, blockSize) {
    const maxBlocks = Math.max(1, Math.ceil(items.length / blockSize));
    const parsed = Number(requestedBlocks);
    const blocks = Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, maxBlocks) : 1;
    const visible = items.slice(0, blocks * blockSize);
    return { blocks, items: visible, hasMore: visible.length < items.length };
}
