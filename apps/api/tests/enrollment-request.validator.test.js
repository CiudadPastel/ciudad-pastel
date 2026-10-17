import { describe, expect, it } from "vitest";

import {
    normalizePhone,
    validateEnrollmentRequestInput,
    ENROLLMENT_REQUEST_LIMITS
} from "../src/validators/enrollment-request.validator.js";

const VALID_REQUEST = {
    courseId: "course-123-uuid",
    fullName: "María González Pérez",
    email: "maria.gonzalez@example.com",
    phone: "8888-8888",
    message: "Quisiera consultar si puedo reservar para 2 personas."
};

describe("Enrollment Request Validator Suite [CIU-87]", () => {
    describe("normalizePhone", () => {
        it("extracts digits only from phone inputs with spaces, hyphens, and country codes", () => {
            expect(normalizePhone("+506 8888-1234")).toBe("50688881234");
            expect(normalizePhone("(506) 8888 1234")).toBe("50688881234");
            expect(normalizePhone("8888-8888")).toBe("88888888");
        });

        it("returns empty string for non-string input", () => {
            expect(normalizePhone(null)).toBe("");
            expect(normalizePhone(undefined)).toBe("");
            expect(normalizePhone(12345678)).toBe("");
        });
    });

    describe("validateEnrollmentRequestInput", () => {
        it("accepts a valid enrollment request and normalizes email and phone", () => {
            const result = validateEnrollmentRequestInput(VALID_REQUEST);

            expect(result.valid).toBe(true);
            expect(result.errors).toEqual([]);
            expect(result.data).toEqual({
                courseId: "course-123-uuid",
                fullName: "María González Pérez",
                email: "maria.gonzalez@example.com",
                phone: "88888888",
                message: "Quisiera consultar si puedo reservar para 2 personas."
            });
        });

        it("rejects non-object body", () => {
            expect(validateEnrollmentRequestInput(null).valid).toBe(false);
            expect(validateEnrollmentRequestInput("").valid).toBe(false);
            expect(validateEnrollmentRequestInput([]).valid).toBe(false);
        });

        it("rejects missing or empty courseId", () => {
            const result = validateEnrollmentRequestInput({
                ...VALID_REQUEST,
                courseId: "   "
            });

            expect(result.valid).toBe(false);
            expect(result.errors).toContain("courseId is required.");
        });

        it("rejects short fullName (< 3 chars) and missing fullName", () => {
            const shortResult = validateEnrollmentRequestInput({
                ...VALID_REQUEST,
                fullName: "Ab"
            });
            expect(shortResult.valid).toBe(false);
            expect(shortResult.errors).toEqual(
                expect.arrayContaining([expect.stringContaining("at least 3 characters")])
            );

            const missingResult = validateEnrollmentRequestInput({
                ...VALID_REQUEST,
                fullName: "   "
            });
            expect(missingResult.valid).toBe(false);
            expect(missingResult.errors).toContain("fullName is required.");
        });

        it("rejects long fullName (> 120 chars)", () => {
            const longName = "A".repeat(121);
            const result = validateEnrollmentRequestInput({
                ...VALID_REQUEST,
                fullName: longName
            });

            expect(result.valid).toBe(false);
            expect(result.errors).toEqual(
                expect.arrayContaining([expect.stringContaining("not exceed 120 characters")])
            );
        });

        it("rejects invalid or missing email", () => {
            const invalidEmail = validateEnrollmentRequestInput({
                ...VALID_REQUEST,
                email: "not-an-email"
            });
            expect(invalidEmail.valid).toBe(false);
            expect(invalidEmail.errors).toEqual(
                expect.arrayContaining([expect.stringContaining("valid email address")])
            );

            const missingEmail = validateEnrollmentRequestInput({
                ...VALID_REQUEST,
                email: "   "
            });
            expect(missingEmail.valid).toBe(false);
            expect(missingEmail.errors).toContain("email is required.");
        });

        it("rejects email exceeding 254 characters", () => {
            const longEmail = `${"a".repeat(250)}@test.com`;
            const result = validateEnrollmentRequestInput({
                ...VALID_REQUEST,
                email: longEmail
            });

            expect(result.valid).toBe(false);
            expect(result.errors).toEqual(
                expect.arrayContaining([expect.stringContaining("not exceed 254 characters")])
            );
        });

        it("normalizes phone with spaces and hyphens into clean digits", () => {
            const result = validateEnrollmentRequestInput({
                ...VALID_REQUEST,
                phone: "  +506 8888-9999  "
            });

            expect(result.valid).toBe(true);
            expect(result.data.phone).toBe("50688889999");
        });

        it("rejects phone with too few digits (< 8)", () => {
            const result = validateEnrollmentRequestInput({
                ...VALID_REQUEST,
                phone: "123-456"
            });

            expect(result.valid).toBe(false);
            expect(result.errors).toEqual(
                expect.arrayContaining([expect.stringContaining("between 8 and 15 digits")])
            );
        });

        it("rejects phone with too many digits (> 15)", () => {
            const result = validateEnrollmentRequestInput({
                ...VALID_REQUEST,
                phone: "1234567890123456"
            });

            expect(result.valid).toBe(false);
            expect(result.errors).toEqual(
                expect.arrayContaining([expect.stringContaining("between 8 and 15 digits")])
            );
        });

        it("rejects phone with letters that don't have enough digits", () => {
            const result = validateEnrollmentRequestInput({
                ...VALID_REQUEST,
                phone: "call-me-88"
            });

            expect(result.valid).toBe(false);
            expect(result.errors).toEqual(
                expect.arrayContaining([expect.stringContaining("between 8 and 15 digits")])
            );
        });

        it("normalizes empty message or whitespace message to null", () => {
            const emptyResult = validateEnrollmentRequestInput({
                ...VALID_REQUEST,
                message: "   "
            });
            expect(emptyResult.valid).toBe(true);
            expect(emptyResult.data.message).toBeNull();

            const nullResult = validateEnrollmentRequestInput({
                ...VALID_REQUEST,
                message: null
            });
            expect(nullResult.valid).toBe(true);
            expect(nullResult.data.message).toBeNull();

            const omittedResult = validateEnrollmentRequestInput({
                courseId: VALID_REQUEST.courseId,
                fullName: VALID_REQUEST.fullName,
                email: VALID_REQUEST.email,
                phone: VALID_REQUEST.phone
            });
            expect(omittedResult.valid).toBe(true);
            expect(omittedResult.data.message).toBeNull();
        });

        it("rejects message exceeding 500 characters", () => {
            const longMessage = "M".repeat(501);
            const result = validateEnrollmentRequestInput({
                ...VALID_REQUEST,
                message: longMessage
            });

            expect(result.valid).toBe(false);
            expect(result.errors).toEqual(
                expect.arrayContaining([expect.stringContaining("not exceed 500 characters")])
            );
        });

        it("ignores protected fields (status, id, courseName, createdAt, updatedAt) sent by client", () => {
            const result = validateEnrollmentRequestInput({
                ...VALID_REQUEST,
                id: "forged-id-123",
                status: "confirmed",
                courseName: "Forged Course Name",
                createdAt: "2020-01-01T00:00:00.000Z",
                updatedAt: "2020-01-01T00:00:00.000Z"
            });

            expect(result.valid).toBe(true);
            expect(result.data).not.toHaveProperty("id");
            expect(result.data).not.toHaveProperty("status");
            expect(result.data).not.toHaveProperty("courseName");
            expect(result.data).not.toHaveProperty("createdAt");
            expect(result.data).not.toHaveProperty("updatedAt");
            expect(Object.keys(result.data).sort()).toEqual([
                "courseId",
                "email",
                "fullName",
                "message",
                "phone"
            ]);
        });
    });
});
