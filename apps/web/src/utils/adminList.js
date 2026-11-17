// Administrative endpoints currently return complete arrays, without cursors.
export const ADMIN_PAGE_SIZE = 20;
export function normalizeListText(value) {
    return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es").trim();
}
export function matchesSearch(values, query) {
    const text = normalizeListText(values.join(" "));
    return normalizeListText(query).split(/\s+/).every((word) => text.includes(word));
}
export function sortRecords(records, order = "updated-desc") {
    const [field, direction] = order.split("-");
    const key = { name: "name", price: "price", created: "createdAt", updated: "updatedAt" }[field] ?? "updatedAt";
    const sign = direction === "asc" ? 1 : -1;
    return [...records].sort((a, b) => {
        const left = a[key], right = b[key];
        if (left == null && right != null) return 1;
        if (right == null && left != null) return -1;
        const diff = key === "price" ? (left ?? 0) - (right ?? 0)
            : String(left ?? "").localeCompare(String(right ?? ""), "es", { sensitivity: "base", numeric: true });
        return sign * diff || String(a.id).localeCompare(String(b.id));
    });
}
export function paginateRecords(records, rawPage) {
    const pages = Math.max(1, Math.ceil(records.length / ADMIN_PAGE_SIZE));
    const requested = Number(rawPage);
    const page = Math.min(pages, Number.isSafeInteger(requested) && requested > 0 ? requested : 1);
    return { page, pages, items: records.slice((page - 1) * ADMIN_PAGE_SIZE, page * ADMIN_PAGE_SIZE) };
}
const requestDate = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Costa_Rica", year: "numeric", month: "2-digit", day: "2-digit" });
export function matchesRequestDates(value, from, to) {
    if (!from && !to) return true;
    if (!value || !Number.isFinite(Date.parse(value))) return false;
    const parts = Object.fromEntries(requestDate.formatToParts(new Date(value)).map(({ type, value: part }) => [type, part]));
    const day = `${parts.year}-${parts.month}-${parts.day}`;
    return (!from || day >= from) && (!to || day <= to);
}
export function adminReturnTo(value, fallback) {
    const path = typeof value === "string" ? value.split(/[?#]/)[0] : "";
    return ["/admin/cursos", "/admin/productos", "/admin/solicitudes"].includes(path) ? value : fallback;
}
