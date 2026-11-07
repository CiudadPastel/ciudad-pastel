import { ID_TYPE } from "../constants/enrollment";

/*
 * Reglas del formulario de solicitud de matrícula. Deben coincidir con
 * apps/api/src/validators/enrollment-request.validator.js.
 */
export const ENROLLMENT_LIMITS = {
    fullName: { min: 3, max: 120 }
};

export const EMPTY_ENROLLMENT_FORM = {
    fullName: "",
    idType: ID_TYPE.NATIONAL,
    idNumber: "",
    phone: ""
};

/** Deja solo los números (la persona puede escribir espacios o guiones). */
export function onlyDigits(value) {
    return String(value ?? "").replace(/\D/g, "");
}

export const NOTE_MAX = 500;

/*
 * Mensajes en "tú" para el formulario público y en "usted" para la
 * administración (formal: true), que habla de otra persona.
 */
const TEXTS = {
    public: {
        name: "Escribe tu nombre completo.",
        nameShort: "Escribe tu nombre completo, con apellidos.",
        dimex: "Escribe tu número de DIMEX.",
        cedula: "Escribe tu número de cédula.",
        typed: "llevas",
        zero: "Si empieza con 0 después de la provincia, inclúyelo.",
        phone: "Escribe tu número de teléfono."
    },
    admin: {
        name: "Escriba el nombre completo.",
        nameShort: "Escriba el nombre completo, con apellidos.",
        dimex: "Escriba el número de DIMEX.",
        cedula: "Escriba el número de cédula.",
        typed: "lleva",
        zero: "Si tiene un 0 después de la provincia, inclúyalo.",
        phone: "Escriba el número de teléfono."
    }
};

export function validateEnrollmentIdentityAndPhone(values, { formal = false } = {}) {
    const t = formal ? TEXTS.admin : TEXTS.public;
    const errors = {};

    const idNumber = onlyDigits(values.idNumber);
    if (!idNumber) {
        errors.idNumber = values.idType === ID_TYPE.DIMEX ? t.dimex : t.cedula;
    } else if (values.idType === ID_TYPE.DIMEX) {
        if (!/^\d{11,12}$/.test(idNumber)) {
            errors.idNumber = `El DIMEX tiene 11 o 12 dígitos (${t.typed} ${idNumber.length}).`;
        }
    } else if (idNumber.length !== 9) {
        errors.idNumber = `La cédula tiene 9 dígitos (${t.typed} ${idNumber.length}). ${t.zero}`;
    } else if (!/^[1-7]/.test(idNumber)) {
        errors.idNumber = "La cédula debe empezar con el número de provincia, del 1 al 7.";
    }

    const phone = onlyDigits(values.phone);
    if (!phone) {
        errors.phone = t.phone;
    } else if (phone.length !== 8) {
        errors.phone = `El teléfono tiene 8 dígitos (${t.typed} ${phone.length}).`;
    }

    return errors;
}

export function validateEnrollmentForm(values, { formal = false } = {}) {
    const t = formal ? TEXTS.admin : TEXTS.public;
    const errors = validateEnrollmentIdentityAndPhone(values, { formal });

    const fullName = values.fullName.trim().replace(/\s+/g, " ");
    if (!fullName) {
        errors.fullName = t.name;
    } else if (fullName.length < ENROLLMENT_LIMITS.fullName.min) {
        errors.fullName = t.nameShort;
    } else if (fullName.length > ENROLLMENT_LIMITS.fullName.max) {
        errors.fullName = `El nombre puede tener como máximo ${ENROLLMENT_LIMITS.fullName.max} caracteres.`;
    }

    if (values.note !== undefined && values.note.trim().length > NOTE_MAX) {
        errors.note = `La nota puede tener como máximo ${NOTE_MAX} caracteres.`;
    }

    return errors;
}

export function toEnrollmentPayload(values) {
    return {
        fullName: values.fullName.trim().replace(/\s+/g, " "),
        idType: values.idType,
        idNumber: onlyDigits(values.idNumber),
        phone: onlyDigits(values.phone)
    };
}

/** Errores de la API (en inglés) -> campo del formulario con mensaje en español. */
export function mapEnrollmentApiErrors(details, { formal = false } = {}) {
    const messages = formal
        ? {
            fullName: "Revise el nombre completo.",
            idType: "Elija el tipo de documento.",
            idNumber: "Revise el número de documento.",
            phone: "Revise el teléfono: debe tener 8 dígitos.",
            note: `La nota puede tener como máximo ${NOTE_MAX} caracteres.`
        }
        : {
            fullName: "Revisa tu nombre completo.",
            idType: "Elige el tipo de documento.",
            idNumber: "Revisa el número de documento.",
            phone: "Revisa el número de teléfono: debe tener 8 dígitos."
        };
    const errors = {};

    for (const detail of Array.isArray(details) ? details : []) {
        const field = String(detail).match(/^[a-zA-Z]+/)?.[0];
        if (messages[field]) errors[field] = messages[field];
    }

    return errors;
}
