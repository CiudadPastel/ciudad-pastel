import { describe, expect, it } from "vitest";

import {
    normalizeNationalId,
    normalizePhone,
    validatePaymentStatusLookupInput
} from "../src/validators/identity.validator.js";

describe("Identity Validator (HU-A07 / CIU-13 - Rama 3)", () => {
    describe("normalizeNationalId", () => {
        it("strips spaces and hyphens from national ID strings", () => {
            expect(normalizeNationalId("1-0234-0567")).toBe("102340567");
            expect(normalizeNationalId("  1 0234 0567  ")).toBe("102340567");
            expect(normalizeNationalId("102340567")).toBe("102340567");
        });

        it("handles numeric inputs gracefully", () => {
            expect(normalizeNationalId(102340567)).toBe("102340567");
        });

        it("returns empty string for null, undefined or non-string/number inputs", () => {
            expect(normalizeNationalId(null)).toBe("");
            expect(normalizeNationalId(undefined)).toBe("");
            expect(normalizeNationalId({})).toBe("");
        });
    });

    describe("normalizePhone", () => {
        it("strips spaces, hyphens, parentheses and leading plus from phone strings", () => {
            expect(normalizePhone("+506 8888-7777")).toBe("50688887777");
            expect(normalizePhone("(506) 8888-7777")).toBe("50688887777");
            expect(normalizePhone("+ (506) 8888-7777")).toBe("50688887777");
            expect(normalizePhone("8888-7777")).toBe("88887777");
            expect(normalizePhone("88887777")).toBe("88887777");
        });

        it("handles numeric inputs gracefully", () => {
            expect(normalizePhone(88887777)).toBe("88887777");
        });

        it("returns empty string for null, undefined or non-string/number inputs", () => {
            expect(normalizePhone(null)).toBe("");
            expect(normalizePhone(undefined)).toBe("");
            expect(normalizePhone({})).toBe("");
        });
    });

    describe("validatePaymentStatusLookupInput", () => {
        it("accepts valid Costa Rican 9-digit national IDs and 8-digit phones", () => {
            const result = validatePaymentStatusLookupInput({
                nationalId: "1-0234-0567",
                phone: "8888-7777"
            });

            expect(result.valid).toBe(true);
            expect(result.errors).toEqual([]);
            expect(result.data).toEqual({
                nationalId: "102340567",
                phone: "88887777"
            });
        });

        it("accepts valid 11 or 12 digit DIMEX residence IDs and international formatted phones", () => {
            const result = validatePaymentStatusLookupInput({
                nationalId: "12345678901",
                phone: "+506 8888 7777"
            });

            expect(result.valid).toBe(true);
            expect(result.errors).toEqual([]);
            expect(result.data).toEqual({
                nationalId: "12345678901",
                phone: "50688887777"
            });
        });

        it("accepts idNumber property as an alternative to nationalId", () => {
            const result = validatePaymentStatusLookupInput({
                idNumber: "1-0234-0567",
                phone: "8888-7777"
            });

            expect(result.valid).toBe(true);
            expect(result.data.nationalId).toBe("102340567");
        });

        it("rejects non-object or array body", () => {
            expect(validatePaymentStatusLookupInput(null).valid).toBe(false);
            expect(validatePaymentStatusLookupInput("string").valid).toBe(false);
            expect(validatePaymentStatusLookupInput([]).valid).toBe(false);
        });

        it("rejects missing nationalId and missing phone", () => {
            const result = validatePaymentStatusLookupInput({});
            expect(result.valid).toBe(false);
            expect(result.errors).toContain("nationalId is required.");
            expect(result.errors).toContain("phone is required.");
        });

        it("rejects nationalId with letters or invalid character formats", () => {
            const result = validatePaymentStatusLookupInput({
                nationalId: "1-0234-056A",
                phone: "88887777"
            });
            expect(result.valid).toBe(false);
            expect(result.errors).toContain("nationalId must contain only digits, spaces, or hyphens.");
        });

        it("rejects nationalId with wrong digit length", () => {
            const result = validatePaymentStatusLookupInput({
                nationalId: "12345",
                phone: "88887777"
            });
            expect(result.valid).toBe(false);
            expect(result.errors).toContain("nationalId must have 9 digits (national) or 11-12 digits (residence).");
        });

        it("rejects phone with letters or invalid characters", () => {
            const result = validatePaymentStatusLookupInput({
                nationalId: "102340567",
                phone: "8888-ABCD"
            });
            expect(result.valid).toBe(false);
            expect(result.errors).toContain("phone must contain only digits, spaces, hyphens, parentheses, or a leading plus.");
        });

        it("rejects phone with fewer than 8 or more than 15 digits", () => {
            const shortPhone = validatePaymentStatusLookupInput({
                nationalId: "102340567",
                phone: "12345"
            });
            expect(shortPhone.valid).toBe(false);
            expect(shortPhone.errors).toContain("phone must have between 8 and 15 digits.");

            const longPhone = validatePaymentStatusLookupInput({
                nationalId: "102340567",
                phone: "1234567890123456"
            });
            expect(longPhone.valid).toBe(false);
            expect(longPhone.errors).toContain("phone must have between 8 and 15 digits.");
        });
    });
});
