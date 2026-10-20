import { ID_TYPE } from "../models/enrollment-request.model.js";
import {
    ENROLLMENT_REQUEST_LIMITS,
    normalizeDigits,
    validateEnrollmentRequestInput
} from "./enrollment-request.validator.js";

export function validateStudentAccessInput(input) {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
        return { valid: false, errors: ["Student verification body must be a valid JSON object."], data: null };
    }

    const length = normalizeDigits(input.idNumber).length;
    const idType = ENROLLMENT_REQUEST_LIMITS.idNumber[ID_TYPE.DIMEX].digits.includes(length)
        ? ID_TYPE.DIMEX
        : ID_TYPE.NATIONAL;
    const result = validateEnrollmentRequestInput({ ...input, idType });
    if (!result.valid) return result;

    const { fullName, idNumber, phone } = result.data;
    return { valid: true, errors: [], data: { fullName, idNumber, phone } };
}
