const currencyFormatter = new Intl.NumberFormat("es-CR", {
    style: "currency",
    currency: "CRC",
    maximumFractionDigits: 0
});

const dateFormatter = new Intl.DateTimeFormat("es-CR", {
    day: "numeric",
    month: "long",
    year: "numeric"
});

const dateTimeFormatter = new Intl.DateTimeFormat("es-CR", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
});

export function formatPrice(value) {
    return typeof value === "number" ? currencyFormatter.format(value) : "—";
}

/** Fecha "YYYY-MM-DD" sin desfase por zona horaria. */
export function formatDate(isoDate) {
    if (!isoDate) return "—";
    const [year, month, day] = isoDate.slice(0, 10).split("-").map(Number);
    return dateFormatter.format(new Date(year, month - 1, day));
}

export function formatDateTime(isoDateTime) {
    if (!isoDateTime) return "—";
    return dateTimeFormatter.format(new Date(isoDateTime));
}
