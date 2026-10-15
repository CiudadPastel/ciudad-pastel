/*
 * Cálculos del horario de un curso (HU-A02).
 *
 * La API guarda el horario así:
 *   { startDate, endDate, startTime, endTime, description }
 * El tipo de horario (un día o semanal), el día de la semana y la cantidad
 * de clases no se guardan: se deducen de las fechas al editar.
 *
 * Las fechas son textos "YYYY-MM-DD" y se calculan en UTC para que la zona
 * horaria no cambie el día.
 */

export const SCHEDULE_TYPE = {
    NONE: "",
    SINGLE: "single",
    WEEKLY: "weekly"
};

export const SESSION_LIMITS = { min: 2, max: 20 };

// value = número de getUTCDay() (0 = domingo). Se muestran de lunes a domingo.
export const WEEKDAYS = [
    { value: "1", name: "lunes", plural: "lunes" },
    { value: "2", name: "martes", plural: "martes" },
    { value: "3", name: "miércoles", plural: "miércoles" },
    { value: "4", name: "jueves", plural: "jueves" },
    { value: "5", name: "viernes", plural: "viernes" },
    { value: "6", name: "sábado", plural: "sábados" },
    { value: "0", name: "domingo", plural: "domingos" }
];

const MONTHS = [
    "enero", "febrero", "marzo", "abril", "mayo", "junio",
    "julio", "agosto", "setiembre", "octubre", "noviembre", "diciembre"
];

const DAY_MS = 24 * 60 * 60 * 1000;

function toUtcDate(isoDate) {
    return new Date(`${isoDate}T00:00:00Z`);
}

function toIso(date) {
    return date.toISOString().slice(0, 10);
}

export function isIsoDate(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = toUtcDate(value);
    return !Number.isNaN(date.getTime()) && toIso(date) === value;
}

export function weekdayOf(isoDate) {
    return String(toUtcDate(isoDate).getUTCDay());
}

export function weekdayName(weekday) {
    return WEEKDAYS.find((d) => d.value === String(weekday))?.name ?? "";
}

function addDays(isoDate, days) {
    return toIso(new Date(toUtcDate(isoDate).getTime() + days * DAY_MS));
}

/** Fecha de la última clase: una por semana, empezando en startDate. */
export function computeEndDate(startDate, sessions) {
    return addDays(startDate, 7 * (Number(sessions) - 1));
}

/** Primera fecha igual o posterior a isoDate que cae en ese día de la semana. */
export function nextWeekday(isoDate, weekday) {
    const diff = (Number(weekday) - Number(weekdayOf(isoDate)) + 7) % 7;
    return addDays(isoDate, diff);
}

/** "2026-10-19" -> "lunes 19 de octubre de 2026" */
export function formatLongDate(isoDate, { withYear = true } = {}) {
    const date = toUtcDate(isoDate);
    const text = `${weekdayName(date.getUTCDay())} ${date.getUTCDate()} de ${MONTHS[date.getUTCMonth()]}`;
    return withYear ? `${text} de ${date.getUTCFullYear()}` : text;
}

/** "13:00" -> "1:00 p. m."; "12:00" -> "12:00 m." */
export function formatTime(time) {
    const [hours, minutes] = time.split(":").map(Number);
    if (hours === 12 && minutes === 0) return "12:00 m.";
    const hour12 = hours % 12 || 12;
    return `${hour12}:${String(minutes).padStart(2, "0")} ${hours < 12 ? "a. m." : "p. m."}`;
}

function capitalize(text) {
    return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Texto del horario que verá el público, por ejemplo:
 *   "6 lunes, de 1:00 p. m. a 5:00 p. m."
 *   "Sábado 13 de junio, de 9:00 a. m. a 3:00 p. m."
 */
export function buildScheduleDescription({ type, weekday, sessions, startDate, startTime, endTime }) {
    const hours = `de ${formatTime(startTime)} a ${formatTime(endTime)}`;

    if (type === SCHEDULE_TYPE.SINGLE) {
        return `${capitalize(formatLongDate(startDate, { withYear: false }))}, ${hours}`;
    }

    const day = WEEKDAYS.find((d) => d.value === String(weekday));
    return `${sessions} ${day.plural}, ${hours}`;
}

/** Horario de la API -> campos del formulario. */
export function scheduleToFormFields(schedule) {
    const empty = {
        scheduleType: SCHEDULE_TYPE.NONE,
        scheduleWeekday: "",
        scheduleSessions: "",
        scheduleStartDate: "",
        scheduleStartTime: "",
        scheduleEndTime: ""
    };

    if (!schedule?.startDate) return empty;

    const { startDate, endDate } = schedule;
    const times = {
        scheduleStartDate: startDate,
        scheduleStartTime: schedule.startTime ?? "",
        scheduleEndTime: schedule.endTime ?? ""
    };

    if (!endDate || endDate === startDate) {
        return { ...empty, ...times, scheduleType: SCHEDULE_TYPE.SINGLE };
    }

    const weeks = Math.floor((toUtcDate(endDate) - toUtcDate(startDate)) / (7 * DAY_MS));

    return {
        ...empty,
        ...times,
        scheduleType: SCHEDULE_TYPE.WEEKLY,
        scheduleWeekday: weekdayOf(startDate),
        scheduleSessions: String(weeks + 1)
    };
}
