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

export function paginateItems(items, requestedPage, pageSize) {
    const pages = Math.max(1, Math.ceil(items.length / pageSize));
    const page = Math.min(pages, Math.max(1, Number.parseInt(requestedPage, 10) || 1));
    return { page, pages, items: items.slice((page - 1) * pageSize, page * pageSize) };
}
