import { describe, expect, it, vi } from "vitest";

// Avoid real Firebase connection
vi.mock("dotenv", () => ({ default: { config: vi.fn() } }));
vi.mock("firebase-admin/app", () => {
    throw new Error("Real Firebase app access is forbidden.");
});
vi.mock("../src/config/firebase.js", () => ({
    db: { collection: vi.fn() }
}));

import { COURSE_STATUS, buildCourse } from "../src/models/course.model.js";
import { COURSE_LIMITS, validateCourseInput } from "../src/validators/course.validator.js";
import { mapCourseDocument } from "../src/repositories/course.repository.js";

const VALID_BASE_COURSE_INPUT = {
    name: "Pastelería Clásica Francesa",
    summary: "Aprende los fundamentos de la pastelería clásica en talleres prácticos.",
    description: "Curso completo de pastelería donde exploraremos masas fermentadas, hojaldres y cremas tradicionales.",
    imageUrl: "https://example.com/images/course.jpg",
    learningOutcomes: ["Dominar la masa hojaldrada", "Preparar crema pastelera"],
    requiredMaterials: ["Batidor de globo", "Termómetro de repostería"]
};

describe("Seasonal Course Data Model and Validation (HU-A08 / CIU-14 - Rama 1)", () => {
    describe("COURSE_LIMITS for seasonName", () => {
        it("defines seasonName limits of 2 to 60 characters", () => {
            expect(COURSE_LIMITS.seasonName).toEqual({ min: 2, max: 60 });
        });
    });

    describe("validateCourseInput with seasonName", () => {
        it("accepts a valid seasonName and returns it trimmed", () => {
            const result = validateCourseInput({
                ...VALID_BASE_COURSE_INPUT,
                seasonName: "Especial Navidad 2026"
            });

            expect(result.valid).toBe(true);
            expect(result.errors).toEqual([]);
            expect(result.data.seasonName).toBe("Especial Navidad 2026");
        });

        it("trims leading and trailing spaces from seasonName", () => {
            const result = validateCourseInput({
                ...VALID_BASE_COURSE_INPUT,
                seasonName: "   Especial Pascua 2026   "
            });

            expect(result.valid).toBe(true);
            expect(result.errors).toEqual([]);
            expect(result.data.seasonName).toBe("Especial Pascua 2026");
        });

        it("stores empty string or whitespace-only seasonName as null", () => {
            const emptyResult = validateCourseInput({
                ...VALID_BASE_COURSE_INPUT,
                seasonName: ""
            });
            expect(emptyResult.valid).toBe(true);
            expect(emptyResult.data.seasonName).toBeNull();

            const spacesResult = validateCourseInput({
                ...VALID_BASE_COURSE_INPUT,
                seasonName: "     "
            });
            expect(spacesResult.valid).toBe(true);
            expect(spacesResult.data.seasonName).toBeNull();
        });

        it("stores null or omitted seasonName as null", () => {
            const nullResult = validateCourseInput({
                ...VALID_BASE_COURSE_INPUT,
                seasonName: null
            });
            expect(nullResult.valid).toBe(true);
            expect(nullResult.data.seasonName).toBeNull();

            const omittedResult = validateCourseInput({
                ...VALID_BASE_COURSE_INPUT
            });
            expect(omittedResult.valid).toBe(true);
            expect(omittedResult.data.seasonName).toBeNull();
        });

        it("rejects seasonName with fewer than 2 characters (1 character)", () => {
            const result = validateCourseInput({
                ...VALID_BASE_COURSE_INPUT,
                seasonName: "N"
            });

            expect(result.valid).toBe(false);
            expect(result.errors).toContain("seasonName must contain at least 2 characters.");
        });

        it("rejects seasonName exceeding 60 characters (61 characters)", () => {
            const tooLong = "A".repeat(61);
            const result = validateCourseInput({
                ...VALID_BASE_COURSE_INPUT,
                seasonName: tooLong
            });

            expect(result.valid).toBe(false);
            expect(result.errors).toContain("seasonName must not exceed 60 characters.");
        });

        it("accepts seasonName at boundary lengths of exactly 2 and 60 characters", () => {
            const minBoundary = validateCourseInput({
                ...VALID_BASE_COURSE_INPUT,
                seasonName: "AB"
            });
            expect(minBoundary.valid).toBe(true);
            expect(minBoundary.data.seasonName).toBe("AB");

            const maxBoundary = validateCourseInput({
                ...VALID_BASE_COURSE_INPUT,
                seasonName: "A".repeat(60)
            });
            expect(maxBoundary.valid).toBe(true);
            expect(maxBoundary.data.seasonName).toBe("A".repeat(60));
        });

        it("rejects non-string values for seasonName", () => {
            const invalidTypes = [123, true, false, {}, [], () => {}];

            for (const value of invalidTypes) {
                const result = validateCourseInput({
                    ...VALID_BASE_COURSE_INPUT,
                    seasonName: value
                });

                expect(result.valid).toBe(false);
                expect(result.errors).toContain("seasonName must be a string.");
            }
        });
    });

    describe("buildCourse model normalization", () => {
        it("includes seasonName when provided", () => {
            const course = buildCourse({
                ...VALID_BASE_COURSE_INPUT,
                seasonName: "Verano 2026"
            });

            expect(course.seasonName).toBe("Verano 2026");
            expect(course.status).toBe(COURSE_STATUS.DRAFT);
        });

        it("defaults seasonName to null when omitted or undefined", () => {
            const course = buildCourse({
                ...VALID_BASE_COURSE_INPUT
            });

            expect(course.seasonName).toBeNull();
        });
    });

    describe("mapCourseDocument legacy compatibility (no database migrations)", () => {
        const createSnapshot = (data, id = "course-doc-123") => ({
            id,
            data: () => ({
                ...data,
                createdAt: { toDate: () => new Date("2026-01-15T10:00:00.000Z") },
                updatedAt: { toDate: () => new Date("2026-01-16T12:00:00.000Z") }
            })
        });

        it("reads a legacy course document without seasonName as seasonName: null", () => {
            const legacySnapshot = createSnapshot({
                name: "Curso Antiguo de Repostería",
                summary: "Resumen del curso antiguo sin datos de temporada.",
                description: "Descripción detallada del curso antiguo sin datos de temporada.",
                status: "published"
            });

            const mapped = mapCourseDocument(legacySnapshot);

            expect(mapped.id).toBe("course-doc-123");
            expect(mapped.name).toBe("Curso Antiguo de Repostería");
            expect(mapped.seasonName).toBeNull();
            expect(mapped.createdAt).toBe("2026-01-15T10:00:00.000Z");
            expect(mapped.updatedAt).toBe("2026-01-16T12:00:00.000Z");
        });

        it("preserves seasonName when reading a document that has the seasonal field", () => {
            const seasonalSnapshot = createSnapshot({
                name: "Taller Navideño de Galletas",
                summary: "Aprende a decorar galletas con motivos de Navidad.",
                description: "Taller intensivo navideño de decoración de galletas.",
                seasonName: "Navidad 2026",
                status: "published"
            });

            const mapped = mapCourseDocument(seasonalSnapshot);

            expect(mapped.seasonName).toBe("Navidad 2026");
        });
    });
});
