import { describe, expect, it, vi } from "vitest";

// Avoid real Firebase connection
vi.mock("dotenv", () => ({ default: { config: vi.fn() } }));
vi.mock("firebase-admin/app", () => {
    throw new Error("Real Firebase app access is forbidden.");
});
vi.mock("../src/config/firebase.js", () => ({
    db: { collection: vi.fn() }
}));

import {
    PAYMENT_STATUS,
    VALID_PAYMENT_STATUSES,
    buildEnrollment,
    isValidPaymentStatus
} from "../src/models/enrollment.model.js";
import { mapEnrollmentDocument } from "../src/repositories/enrollment.repository.js";

describe("Enrollment Payment Status Data Model (HU-A07 / CIU-13 - Rama 1)", () => {
    describe("PAYMENT_STATUS constants and validation", () => {
        it("defines the expected payment status enum values", () => {
            expect(PAYMENT_STATUS).toEqual({
                PENDING: "pending",
                DEPOSIT_PAID: "deposit_paid",
                PAID: "paid"
            });
            expect(Object.isFrozen(PAYMENT_STATUS)).toBe(true);
            expect(VALID_PAYMENT_STATUSES).toEqual(["pending", "deposit_paid", "paid"]);
            expect(Object.isFrozen(VALID_PAYMENT_STATUSES)).toBe(true);
        });

        it("validates allowed payment status values with isValidPaymentStatus", () => {
            expect(isValidPaymentStatus("pending")).toBe(true);
            expect(isValidPaymentStatus("deposit_paid")).toBe(true);
            expect(isValidPaymentStatus("paid")).toBe(true);
        });

        it("rejects invalid, malformed or non-string payment statuses", () => {
            const invalidValues = [
                "unknown",
                "PENDING",
                "deposit",
                "completed",
                "",
                null,
                undefined,
                123,
                true,
                false,
                {},
                []
            ];

            for (const value of invalidValues) {
                expect(isValidPaymentStatus(value)).toBe(false);
            }
        });
    });

    describe("buildEnrollment defaults and custom values", () => {
        it("assigns paymentStatus: 'pending', paymentUpdatedAt: null and paymentUpdatedBy: null by default", () => {
            const enrollment = buildEnrollment({
                id: "enr-1",
                courseId: "course-101",
                courseName: "Pastelería Básica",
                fullName: "María Rodríguez",
                idType: "national",
                idNumber: "102340567",
                phone: "88887777"
            });

            expect(enrollment.paymentStatus).toBe(PAYMENT_STATUS.PENDING);
            expect(enrollment.paymentUpdatedAt).toBeNull();
            expect(enrollment.paymentUpdatedBy).toBeNull();
        });

        it("accepts explicitly supplied payment status values upon creation", () => {
            const enrollment = buildEnrollment({
                id: "enr-2",
                courseId: "course-102",
                courseName: "Repostería Francesa",
                fullName: "Carlos Jiménez",
                idType: "national",
                idNumber: "109870654",
                phone: "87654321",
                paymentStatus: PAYMENT_STATUS.DEPOSIT_PAID,
                paymentUpdatedAt: "2026-03-01T15:00:00.000Z",
                paymentUpdatedBy: "admin-uid-1"
            });

            expect(enrollment.paymentStatus).toBe(PAYMENT_STATUS.DEPOSIT_PAID);
            expect(enrollment.paymentUpdatedAt).toBe("2026-03-01T15:00:00.000Z");
            expect(enrollment.paymentUpdatedBy).toBe("admin-uid-1");
        });
    });

    describe("mapEnrollmentDocument backward compatibility (no migrations)", () => {
        it("maps legacy enrollment documents without payment status to paymentStatus: 'pending'", () => {
            const legacySnapshot = {
                id: "legacy-enr-1",
                data: () => ({
                    courseId: "course-101",
                    courseName: "Pastelería Básica",
                    fullName: "Estudiante Antiguo",
                    idType: "national",
                    idNumber: "101110222",
                    phone: "88889999",
                    status: "enrolled",
                    note: null,
                    confirmedAt: null,
                    cancelledAt: null,
                    createdAt: null,
                    updatedAt: null
                    // paymentStatus, paymentUpdatedAt and paymentUpdatedBy are absent
                })
            };

            const mapped = mapEnrollmentDocument(legacySnapshot);

            expect(mapped.id).toBe("legacy-enr-1");
            expect(mapped.paymentStatus).toBe(PAYMENT_STATUS.PENDING);
            expect(mapped.paymentUpdatedAt).toBeNull();
            expect(mapped.paymentUpdatedBy).toBeNull();
        });

        it("maps modern enrollment documents with explicit payment status and timestamps", () => {
            const fakeTimestamp = {
                toDate: () => new Date("2026-03-01T18:00:00.000Z")
            };

            const modernSnapshot = {
                id: "modern-enr-2",
                data: () => ({
                    courseId: "course-102",
                    courseName: "Pasteles Modernos",
                    fullName: "Estudiante Reciente",
                    idType: "national",
                    idNumber: "103330444",
                    phone: "87776666",
                    status: "enrolled",
                    note: "Comprobante SINPE #123456",
                    paymentStatus: PAYMENT_STATUS.PAID,
                    paymentUpdatedAt: fakeTimestamp,
                    paymentUpdatedBy: "admin-uid-99",
                    confirmedAt: fakeTimestamp,
                    cancelledAt: null,
                    createdAt: fakeTimestamp,
                    updatedAt: fakeTimestamp
                })
            };

            const mapped = mapEnrollmentDocument(modernSnapshot);

            expect(mapped.id).toBe("modern-enr-2");
            expect(mapped.paymentStatus).toBe(PAYMENT_STATUS.PAID);
            expect(mapped.paymentUpdatedAt).toBe("2026-03-01T18:00:00.000Z");
            expect(mapped.paymentUpdatedBy).toBe("admin-uid-99");
        });
    });
});
