/*
 * Solicitudes de matrícula (HU-A05). Los valores coinciden con el backend
 * (apps/api/src/models/enrollment-request.model.js).
 */
export const ENROLLMENT_STATUS = {
    PENDING: "pending",
    CONTACTED: "contacted",
    DISCARDED: "discarded",
    // La solicitud ya es una matrícula confirmada (HU-A09)
    CONFIRMED: "confirmed"
};

export const ENROLLMENT_STATUS_LABELS = {
    [ENROLLMENT_STATUS.PENDING]: "Pendiente",
    [ENROLLMENT_STATUS.CONTACTED]: "Contactada",
    [ENROLLMENT_STATUS.DISCARDED]: "Descartada",
    [ENROLLMENT_STATUS.CONFIRMED]: "Confirmada"
};

// Matrícula confirmada (HU-A09)
export const STUDENT_STATUS = {
    ENROLLED: "enrolled",
    CANCELLED: "cancelled"
};

export const PAYMENT_STATUS = Object.freeze({
    PENDING: "pending",
    DEPOSIT_PAID: "deposit_paid",
    PAID: "paid"
});

export const PAYMENT_STATUS_LABELS = Object.freeze({
    [PAYMENT_STATUS.PENDING]: "Pendiente",
    [PAYMENT_STATUS.DEPOSIT_PAID]: "Adelanto pagado",
    [PAYMENT_STATUS.PAID]: "Pagado"
});

export const ID_TYPE = {
    NATIONAL: "national",
    DIMEX: "dimex"
};

export const ID_TYPES = [
    { value: ID_TYPE.NATIONAL, label: "Cédula nacional", short: "Cédula", hint: "9 dígitos, sin guiones. Ej.: 105380021", maxDigits: 9 },
    { value: ID_TYPE.DIMEX, label: "DIMEX", short: "DIMEX", hint: "11 o 12 dígitos, sin guiones.", maxDigits: 12 }
];

export function idTypeShortLabel(value) {
    return ID_TYPES.find((type) => type.value === value)?.short ?? "Documento";
}

// WhatsApp de Ciudad Pastel para consultas (6378-5912)
export const CIUDAD_PASTEL_WHATSAPP = "63785912";

/** Enlace de WhatsApp a un número de Costa Rica (8 dígitos), con mensaje opcional. */
export function whatsappLink(phone, text) {
    const url = `https://wa.me/506${phone}`;
    return text ? `${url}?text=${encodeURIComponent(text)}` : url;
}

/** "88888888" -> "8888-8888" (como se escriben los teléfonos en Costa Rica). */
export function formatPhone(phone) {
    return /^\d{8}$/.test(phone ?? "") ? `${phone.slice(0, 4)}-${phone.slice(4)}` : phone ?? "";
}
