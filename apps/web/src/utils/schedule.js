/*
 * Cálculos del horario de un curso (HU-A02).
 *
 * La API guarda el horario así:
 *   { startDate, endDate, startTime, endTime,
 *     frequency: "single" | "weekly", weekday: "monday"… | null, scheduleNote }
 * La cantidad de clases no se guarda: se deduce de las fechas al editar.
 *
 * Las fechas son textos "YYYY-MM-DD" y se calculan en UTC para que la zona
 * horaria no cambie el día.
 */

export const SCHEDULE_TYPE = {
    NONE: "",
    SINGLE: "single",
    WEEKLY: "weekly"
};

export const SESSION_LIMITS = { min: 2, max: 52 };

// value = valor de la API (WEEKDAY en apps/api/src/models/course.model.js).
// jsDay = número de getUTCDay() (0 = domingo). Se muestran de lunes a domingo.
export const WEEKDAYS = [
    { value: "monday", jsDay: 1, name: "lunes", plural: "lunes" },
    { value: "tuesday", jsDay: 2, name: "martes", plural: "martes" },
    { value: "wednesday", jsDay: 3, name: "miércoles", plural: "miércoles" },
    { value: "thursday", jsDay: 4, name: "jueves", plural: "jueves" },
    { value: "friday", jsDay: 5, name: "viernes", plural: "viernes" },
    { value: "saturday", jsDay: 6, name: "sábado", plural: "sábados" },
    { value: "sunday", jsDay: 0, name: "domingo", plural: "domingos" }
];

const MONTHS_SHORT = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "set", "oct", "nov", "dic"];

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

/** Día de la semana de una fecha, en formato de la API ("monday"…). */
export function weekdayOf(isoDate) {
    const jsDay = toUtcDate(isoDate).getUTCDay();
    return WEEKDAYS.find((d) => d.jsDay === jsDay).value;
}

export function weekdayName(weekday) {
    return WEEKDAYS.find((d) => d.value === weekday)?.name ?? "";
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
    const target = WEEKDAYS.find((d) => d.value === weekday).jsDay;
    const diff = (target - toUtcDate(isoDate).getUTCDay() + 7) % 7;
    return addDays(isoDate, diff);
}

/** Cantidad de clases semanales entre dos fechas (inclusive). */
export function countWeeklySessions(startDate, endDate) {
    return Math.floor((toUtcDate(endDate) - toUtcDate(startDate)) / (7 * DAY_MS)) + 1;
}

/** "2026-10-19" -> "lunes 19 de octubre de 2026" */
export function formatLongDate(isoDate, { withYear = true } = {}) {
    const date = toUtcDate(isoDate);
    const day = WEEKDAYS.find((d) => d.jsDay === date.getUTCDay()).name;
    const text = `${day} ${date.getUTCDate()} de ${MONTHS[date.getUTCMonth()]}`;
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

/** "2026-10-19" -> "19 oct" */
function formatShortDate(isoDate, { withYear = false } = {}) {
    const date = toUtcDate(isoDate);
    const text = `${date.getUTCDate()} ${MONTHS_SHORT[date.getUTCMonth()]}`;
    return withYear ? `${text} ${date.getUTCFullYear()}` : text;
}

/**
 * Horario en una línea para leerlo rápido, por ejemplo:
 *   "Todos los lunes, de 1:00 p. m. a 5:00 p. m."
 *   "Sábado 13 de junio de 2026, de 9:00 a. m. a 12:00 m."
 * Devuelve null si faltan datos (cursos viejos sin horas o sin frecuencia).
 */
export function formatScheduleSummary(schedule) {
    if (!schedule?.startDate || !schedule.startTime || !schedule.endTime || !schedule.frequency) {
        return null;
    }

    const hours = `de ${formatTime(schedule.startTime)} a ${formatTime(schedule.endTime)}`;

    if (schedule.frequency === SCHEDULE_TYPE.SINGLE) {
        return `${capitalize(formatLongDate(schedule.startDate))}, ${hours}`;
    }

    const day = WEEKDAYS.find((d) => d.value === schedule.weekday);
    return day ? `Todos los ${day.plural}, ${hours}` : null;
}

/** "19 oct – 23 nov 2026 · 6 clases" para horarios semanales. */
export function formatScheduleRange(schedule) {
    if (schedule?.frequency !== SCHEDULE_TYPE.WEEKLY || !schedule.startDate || !schedule.endDate) {
        return null;
    }

    const sessions = countWeeklySessions(schedule.startDate, schedule.endDate);
    return `${formatShortDate(schedule.startDate)} – ${formatShortDate(schedule.endDate, { withYear: true })} · ${sessions} ${sessions === 1 ? "clase" : "clases"}`;
}

/** Horario de la API -> campos del formulario. */
export function scheduleToFormFields(schedule) {
    const empty = {
        scheduleType: SCHEDULE_TYPE.NONE,
        scheduleWeekday: "",
        scheduleSessions: "",
        scheduleStartDate: "",
        scheduleStartTime: "",
        scheduleEndTime: "",
        scheduleNote: ""
    };

    if (!schedule?.startDate) return empty;

    const { startDate, endDate } = schedule;
    const common = {
        ...empty,
        scheduleStartDate: startDate,
        scheduleStartTime: schedule.startTime ?? "",
        scheduleEndTime: schedule.endTime ?? "",
        scheduleNote: schedule.scheduleNote ?? ""
    };

    // Cursos viejos no tienen frecuencia: se deduce de las fechas
    const weekly = schedule.frequency
        ? schedule.frequency === SCHEDULE_TYPE.WEEKLY
        : Boolean(endDate && endDate !== startDate);

    if (!weekly) {
        return { ...common, scheduleType: SCHEDULE_TYPE.SINGLE };
    }

    return {
        ...common,
        scheduleType: SCHEDULE_TYPE.WEEKLY,
        scheduleWeekday: schedule.weekday ?? weekdayOf(startDate),
        scheduleSessions: endDate ? String(countWeeklySessions(startDate, endDate)) : ""
    };
}
