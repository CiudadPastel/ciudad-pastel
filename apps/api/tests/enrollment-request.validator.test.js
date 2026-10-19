import { describe, expect, it } from "vitest";

import {
    normalizeDigits,
    validateEnrollmentListFilters,
    validateEnrollmentRequestInput,
    validateEnrollmentStatusInput
} from "../src/validators/enrollment-request.validator.js";

const VALID_REQUEST = {
    fullName: "María González Pérez",
    idType: "national",
    idNumber: "205380021",
    phone: "88888888"
};

function errorsFor(changes) {
    return validateEnrollmentRequestInput({ ...VALID_REQUEST, ...changes }).errors;
}

describe("Enrollment request validator (HU-A05)", () => {
    describe("normalizeDigits", () => {
        it("keeps only digits", () => {
            expect(normalizeDigits("2-0538-0021")).toBe("205380021");
            expect(normalizeDigits(" 8888 8888 ")).toBe("88888888");
            expect(normalizeDigits(null)).toBe("");
        });
    });

    describe("validateEnrollmentRequestInput", () => {
        it("accepts a valid national ID request and returns only the allowed fields", () => {
            const result = validateEnrollmentRequestInput({
                ...VALID_REQUEST,
                fullName: "  María   González Pérez ",
                courseId: "ignored",
                status: "contacted",
                email: "ignored@example.com"
            });

            expect(result).toEqual({
                valid: true,
                errors: [],
                data: {
                    fullName: "María González Pérez",
                    idType: "national",
                    idNumber: "205380021",
                    phone: "88888888"
                }
            });
        });

        it("removes spaces and hyphens from the ID number and phone", () => {
            const result = validateEnrollmentRequestInput({
                ...VALID_REQUEST,
                idNumber: "2-0538-0021",
                phone: "8888-8888"
            });

            expect(result.valid).toBe(true);
            expect(result.data.idNumber).toBe("205380021");
            expect(result.data.phone).toBe("88888888");
        });

        it.each(["100000000", "799999999"])("accepts national ID %s (province 1 to 7)", (idNumber) => {
            expect(errorsFor({ idNumber })).toEqual([]);
        });

        it.each([
            ["8 digits", "20538021"],
            ["10 digits", "2053800210"],
            ["province 0", "005380021"],
            ["province 8", "805380021"],
            ["province 9", "905380021"],
            ["letters", "2053800AB"]
        ])("rejects a national ID with %s", (_label, idNumber) => {
            expect(errorsFor({ idNumber })).toEqual([
                expect.stringContaining("9 digits")
            ]);
        });

        it.each(["15512345678", "155123456789"])("accepts DIMEX %s (11 or 12 digits)", (idNumber) => {
            expect(errorsFor({ idType: "dimex", idNumber })).toEqual([]);
        });

        it.each(["205380021", "1551234567", "1551234567890"])("rejects DIMEX %s", (idNumber) => {
            expect(errorsFor({ idType: "dimex", idNumber })).toEqual([
                expect.stringContaining("11 or 12 digits")
            ]);
        });

        it.each([
            ["7 digits", "8888888"],
            ["9 digits", "888888888"],
            ["country code", "+506 8888 8888"],
            ["letters", "8888abcd"]
        ])("rejects a phone with %s", (_label, phone) => {
            expect(errorsFor({ phone })).toEqual([expect.stringContaining("exactly 8 digits")]);
        });

        it("reports every missing required field", () => {
            const result = validateEnrollmentRequestInput({});

            expect(result.valid).toBe(false);
            expect(result.errors).toEqual([
                "fullName is required.",
                "idType is required.",
                "idNumber is required.",
                "phone is required."
            ]);
        });

        it.each([
            ["short name", { fullName: "Al" }, "fullName"],
            ["long name", { fullName: "a".repeat(121) }, "fullName"],
            ["non-text name", { fullName: 123 }, "fullName"],
            ["unknown ID type", { idType: "passport" }, "idType"],
            ["numeric ID", { idNumber: 205380021 }, "idNumber"],
            ["numeric phone", { phone: 88888888 }, "phone"]
        ])("rejects %s", (_label, changes, field) => {
            expect(errorsFor(changes)).toEqual([expect.stringContaining(field)]);
        });

        it.each([null, [], "text"])("rejects a non-object body %j", (body) => {
            expect(validateEnrollmentRequestInput(body).valid).toBe(false);
        });
    });

    describe("validateEnrollmentStatusInput", () => {
        it.each(["pending", "contacted", "discarded"])("accepts %s", (status) => {
            expect(validateEnrollmentStatusInput({ status })).toEqual({
                valid: true,
                errors: [],
                data: { status }
            });
        });

        it.each([{}, { status: "cancelled" }, { status: "confirmed" }, { status: null }, null, []])("rejects %j", (body) => {
            expect(validateEnrollmentStatusInput(body).valid).toBe(false);
        });
    });

    describe("validateEnrollmentListFilters", () => {
        it("accepts no filters, a course and a status", () => {
            expect(validateEnrollmentListFilters({}).data).toEqual({});
            expect(validateEnrollmentListFilters({ courseId: " c-1 ", status: "pending" }).data)
                .toEqual({ courseId: "c-1", status: "pending" });
        });

        it("rejects an unknown status and an empty course", () => {
            expect(validateEnrollmentListFilters({ status: "banana" }).valid).toBe(false);
            expect(validateEnrollmentListFilters({ courseId: " " }).valid).toBe(false);
        });
    });
});
