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

export function validateEnrollmentForm(values) {
    const errors = {};

    const fullName = values.fullName.trim().replace(/\s+/g, " ");
    if (!fullName) {
        errors.fullName = "Escribe tu nombre completo.";
    } else if (fullName.length < ENROLLMENT_LIMITS.fullName.min) {
        errors.fullName = "Escribe tu nombre completo, con apellidos.";
    } else if (fullName.length > ENROLLMENT_LIMITS.fullName.max) {
        errors.fullName = `El nombre puede tener como máximo ${ENROLLMENT_LIMITS.fullName.max} caracteres.`;
    }

    const idNumber = onlyDigits(values.idNumber);
    if (!idNumber) {
        errors.idNumber = values.idType === ID_TYPE.DIMEX
            ? "Escribe tu número de DIMEX."
            : "Escribe tu número de cédula.";
    } else if (values.idType === ID_TYPE.DIMEX) {
        if (!/^\d{11,12}$/.test(idNumber)) {
            errors.idNumber = `El DIMEX tiene 11 o 12 dígitos (llevas ${idNumber.length}).`;
        }
    } else if (idNumber.length !== 9) {
        errors.idNumber = `La cédula tiene 9 dígitos (llevas ${idNumber.length}). Si empieza con 0 después de la provincia, inclúyelo.`;
    } else if (!/^[1-7]/.test(idNumber)) {
        errors.idNumber = "La cédula debe empezar con el número de provincia, del 1 al 7.";
    }

    const phone = onlyDigits(values.phone);
    if (!phone) {
        errors.phone = "Escribe tu número de teléfono.";
    } else if (phone.length !== 8) {
        errors.phone = `El teléfono tiene 8 dígitos (llevas ${phone.length}).`;
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
export function mapEnrollmentApiErrors(details) {
    const messages = {
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
