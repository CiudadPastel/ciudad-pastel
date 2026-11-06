import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

const fake = vi.hoisted(() => {
    const enrollments = new Map();
    let clock = 0;
    const tick = () => new Date(Date.UTC(2026, 9, 20, 12, 0, ++clock)).toISOString();
    const clone = (val) => structuredClone(val);

    return {
        enrollments,
        tick,
        verifyIdToken: vi.fn(),
        courseRepository: {
            getCourseById: vi.fn(async (id) => ({ id, name: "Pastelería Básica", status: "active" }))
        },
        enrollmentRepository: {
            getEnrollmentById: vi.fn(async (id) => clone(enrollments.get(id) ?? null)),
            getEnrollmentsByCourse: vi.fn(async (courseId) =>
                [...enrollments.values()].filter((e) => e.courseId === courseId).map(clone)
            ),
            updateEnrollmentPaymentStatus: vi.fn(async (id, { paymentStatus, paymentUpdatedBy }) => {
                const current = enrollments.get(id);
                if (!current) return null;
                const now = tick();
                const updated = {
                    ...current,
                    paymentStatus,
                    paymentUpdatedBy: paymentUpdatedBy ?? null,
                    paymentUpdatedAt: now,
                    updatedAt: now
                };
                enrollments.set(id, updated);
                return clone(updated);
            }),
            lookupEnrollmentsByStudent: vi.fn(async ({ nationalId, phone }) => {
                const id = String(nationalId).replace(/\D/g, "");
                const tel = String(phone).replace(/\D/g, "");
                const candidatePhones = [tel];
                if (tel.startsWith("506") && tel.length === 11) candidatePhones.push(tel.slice(3));
                return [...enrollments.values()]
                    .filter((e) => e.idNumber === id && candidatePhones.includes(e.phone))
                    .map(clone);
            })
        }
    };
});

// Mock environment and external dependencies
vi.mock("dotenv", () => ({ default: { config: vi.fn() } }));
vi.mock("firebase-admin/app", () => {
    throw new Error("Real Firebase app access is forbidden.");
});
vi.mock("../src/config/firebase.js", () => ({
    auth: { verifyIdToken: fake.verifyIdToken },
    db: { collection: vi.fn() }
}));
vi.mock("../src/repositories/enrollment.repository.js", () => fake.enrollmentRepository);
vi.mock("../src/repositories/course.repository.js", () => fake.courseRepository);

import app from "../src/app.js";
import { paymentStatusLookupRateLimit } from "../src/middleware/rate-limit.middleware.js";

const ADMIN_TOKEN = "valid-admin-token";
const REGULAR_USER_TOKEN = "regular-user-token";
const ADMIN_AUTH_HEADER = { Authorization: `Bearer ${ADMIN_TOKEN}` };
const USER_AUTH_HEADER = { Authorization: `Bearer ${REGULAR_USER_TOKEN}` };

describe("Enrollment Payment Status API (HU-A07 / CIU-13 - Rama 2)", () => {
    const SAMPLE_ENROLLMENT = {
        id: "enr-test-1",
        courseId: "course-101",
        courseName: "Pastelería Básica",
        fullName: "Sofía Mora Castro",
        idType: "national",
        idNumber: "102340567",
        phone: "88887777",
        note: "Matrícula de prueba",
        status: "enrolled",
        paymentStatus: "pending",
        paymentUpdatedAt: null,
        paymentUpdatedBy: null,
        confirmedAt: "2026-03-01T10:00:00.000Z",
        cancelledAt: null,
        createdAt: "2026-03-01T10:00:00.000Z",
        updatedAt: "2026-03-01T10:00:00.000Z"
    };

    beforeEach(() => {
        vi.clearAllMocks();
        paymentStatusLookupRateLimit.reset();
        fake.enrollments.clear();
        fake.enrollments.set(SAMPLE_ENROLLMENT.id, structuredClone(SAMPLE_ENROLLMENT));

        fake.verifyIdToken.mockImplementation(async (token) => {
            if (token === ADMIN_TOKEN) {
                return { uid: "admin-user-123", email: "admin@ciudadpastel.com", admin: true };
            }
            if (token === REGULAR_USER_TOKEN) {
                return { uid: "regular-user-456", email: "student@example.com", admin: false };
            }
            throw new Error("Decoding Firebase ID token failed");
        });
    });

    describe("PATCH /api/admin/enrollments/:id/payment-status", () => {
        describe("Authentication and Authorization", () => {
            it("returns 401 when Authorization header is missing", async () => {
                const res = await request(app)
                    .patch(`/api/admin/enrollments/${SAMPLE_ENROLLMENT.id}/payment-status`)
                    .send({ paymentStatus: "deposit_paid" });

                expect(res.status).toBe(401);
                expect(res.body).toEqual({ message: "Authentication required" });
                expect(fake.enrollmentRepository.updateEnrollmentPaymentStatus).not.toHaveBeenCalled();
            });

            it("returns 401 when token is invalid or expired", async () => {
                const res = await request(app)
                    .patch(`/api/admin/enrollments/${SAMPLE_ENROLLMENT.id}/payment-status`)
                    .set({ Authorization: "Bearer invalid-token" })
                    .send({ paymentStatus: "deposit_paid" });

                expect(res.status).toBe(401);
                expect(res.body).toEqual({ message: "Invalid or expired authentication token" });
                expect(fake.enrollmentRepository.updateEnrollmentPaymentStatus).not.toHaveBeenCalled();
            });

            it("returns 403 when user is not an administrator", async () => {
                const res = await request(app)
                    .patch(`/api/admin/enrollments/${SAMPLE_ENROLLMENT.id}/payment-status`)
                    .set(USER_AUTH_HEADER)
                    .send({ paymentStatus: "deposit_paid" });

                expect(res.status).toBe(403);
                expect(res.body).toEqual({ message: "Administrator privileges required" });
                expect(fake.enrollmentRepository.updateEnrollmentPaymentStatus).not.toHaveBeenCalled();
            });
        });

        describe("Input Validation (400)", () => {
            it("returns 400 when body is empty or missing paymentStatus", async () => {
                const res = await request(app)
                    .patch(`/api/admin/enrollments/${SAMPLE_ENROLLMENT.id}/payment-status`)
                    .set(ADMIN_AUTH_HEADER)
                    .send({});

                expect(res.status).toBe(400);
                expect(res.body.errors).toEqual(
                    expect.arrayContaining([expect.stringContaining("paymentStatus must be one of: pending, deposit_paid, paid.")])
                );
            });

            it("returns 400 when paymentStatus is not one of the allowed values", async () => {
                const invalidStatuses = ["unknown", "PENDING", "completed", "cancelled", 123, null];

                for (const invalid of invalidStatuses) {
                    const res = await request(app)
                        .patch(`/api/admin/enrollments/${SAMPLE_ENROLLMENT.id}/payment-status`)
                        .set(ADMIN_AUTH_HEADER)
                        .send({ paymentStatus: invalid });

                    expect(res.status).toBe(400);
                    expect(res.body.errors).toEqual(
                        expect.arrayContaining([expect.stringContaining("paymentStatus must be one of: pending, deposit_paid, paid.")])
                    );
                }
            });
        });

        describe("Resource Lookup (404)", () => {
            it("returns 404 when enrollment does not exist", async () => {
                const res = await request(app)
                    .patch("/api/admin/enrollments/non-existent-enrollment-id/payment-status")
                    .set(ADMIN_AUTH_HEADER)
                    .send({ paymentStatus: "deposit_paid" });

                expect(res.status).toBe(404);
                expect(res.body).toEqual({ message: "Enrollment not found." });
            });
        });

        describe("Successful Payment Status Updates and State Transitions", () => {
            it("updates paymentStatus to deposit_paid, records who and when", async () => {
                const res = await request(app)
                    .patch(`/api/admin/enrollments/${SAMPLE_ENROLLMENT.id}/payment-status`)
                    .set(ADMIN_AUTH_HEADER)
                    .send({ paymentStatus: "deposit_paid" });

                expect(res.status).toBe(200);
                expect(res.body.id).toBe(SAMPLE_ENROLLMENT.id);
                expect(res.body.paymentStatus).toBe("deposit_paid");
                expect(res.body.paymentUpdatedBy).toBe("admin-user-123");
                expect(res.body.paymentUpdatedAt).toBeDefined();
                expect(new Date(res.body.paymentUpdatedAt).toISOString()).toBe(res.body.paymentUpdatedAt);
            });

            it("allows transitioning between the 3 statuses in any order to correct errors", async () => {
                // 1. pending -> deposit_paid
                const res1 = await request(app)
                    .patch(`/api/admin/enrollments/${SAMPLE_ENROLLMENT.id}/payment-status`)
                    .set(ADMIN_AUTH_HEADER)
                    .send({ paymentStatus: "deposit_paid" });
                expect(res1.status).toBe(200);
                expect(res1.body.paymentStatus).toBe("deposit_paid");

                // 2. deposit_paid -> paid
                const res2 = await request(app)
                    .patch(`/api/admin/enrollments/${SAMPLE_ENROLLMENT.id}/payment-status`)
                    .set(ADMIN_AUTH_HEADER)
                    .send({ paymentStatus: "paid" });
                expect(res2.status).toBe(200);
                expect(res2.body.paymentStatus).toBe("paid");

                // 3. paid -> pending (correction)
                const res3 = await request(app)
                    .patch(`/api/admin/enrollments/${SAMPLE_ENROLLMENT.id}/payment-status`)
                    .set(ADMIN_AUTH_HEADER)
                    .send({ paymentStatus: "pending" });
                expect(res3.status).toBe(200);
                expect(res3.body.paymentStatus).toBe("pending");

                // 4. pending directly to paid
                const res4 = await request(app)
                    .patch(`/api/admin/enrollments/${SAMPLE_ENROLLMENT.id}/payment-status`)
                    .set(ADMIN_AUTH_HEADER)
                    .send({ paymentStatus: "paid" });
                expect(res4.status).toBe(200);
                expect(res4.body.paymentStatus).toBe("paid");
            });

            it("reflects the updated paymentStatus in enrollment detail", async () => {
                // Update to deposit_paid
                await request(app)
                    .patch(`/api/admin/enrollments/${SAMPLE_ENROLLMENT.id}/payment-status`)
                    .set(ADMIN_AUTH_HEADER)
                    .send({ paymentStatus: "deposit_paid" });

                // Check via GET /api/admin/enrollments/:id
                const detailRes = await request(app)
                    .get(`/api/admin/enrollments/${SAMPLE_ENROLLMENT.id}`)
                    .set(ADMIN_AUTH_HEADER);

                expect(detailRes.status).toBe(200);
                expect(detailRes.body.paymentStatus).toBe("deposit_paid");
                expect(detailRes.body.paymentUpdatedBy).toBe("admin-user-123");
                expect(detailRes.body.paymentUpdatedAt).toBeDefined();

                // Check via GET /api/admin/courses/:courseId/enrollments
                const courseEnrollmentsRes = await request(app)
                    .get(`/api/admin/courses/${SAMPLE_ENROLLMENT.courseId}/enrollments`)
                    .set(ADMIN_AUTH_HEADER);

                expect(courseEnrollmentsRes.status).toBe(200);
                const found = courseEnrollmentsRes.body.find((e) => e.id === SAMPLE_ENROLLMENT.id);
                expect(found).toBeDefined();
                expect(found.paymentStatus).toBe("deposit_paid");
            });
        });

        describe("Repository Failure Isolation (500)", () => {
            it("returns clean 500 when repository update throws unexpected error", async () => {
                fake.enrollmentRepository.updateEnrollmentPaymentStatus.mockRejectedValueOnce(
                    new Error("DB_CONN_TIMEOUT: Firestore transaction write failed")
                );

                const res = await request(app)
                    .patch(`/api/admin/enrollments/${SAMPLE_ENROLLMENT.id}/payment-status`)
                    .set(ADMIN_AUTH_HEADER)
                    .send({ paymentStatus: "paid" });

                expect(res.status).toBe(500);
                expect(res.body).toEqual({ message: "Could not update payment status." });
                expect(res.body.stack).toBeUndefined();
                expect(JSON.stringify(res.body)).not.toContain("DB_CONN_TIMEOUT");
            });
        });
    });

    describe("POST /api/enrollments/payment-status (Student Payment Status Lookup - HU-A07)", () => {
        it("returns matching enrollments for valid nationalId and phone", async () => {
            const res = await request(app)
                .post("/api/enrollments/payment-status")
                .send({
                    nationalId: SAMPLE_ENROLLMENT.idNumber,
                    phone: SAMPLE_ENROLLMENT.phone
                });

            expect(res.status).toBe(200);
            expect(res.body).toEqual({
                enrollments: [
                    {
                        courseName: "Pastelería Básica",
                        paymentStatus: "pending",
                        paymentUpdatedAt: null
                    }
                ]
            });
        });

        it("returns multiple enrollments when student has several courses", async () => {
            const secondEnrollment = {
                id: "enr-test-2",
                courseId: "course-102",
                courseName: "Repostería Francesa",
                fullName: "Sofía Mora Castro",
                idType: "national",
                idNumber: "102340567",
                phone: "88887777",
                note: null,
                status: "enrolled",
                paymentStatus: "paid",
                paymentUpdatedAt: "2026-03-02T12:00:00.000Z",
                paymentUpdatedBy: "admin-1",
                confirmedAt: "2026-03-02T12:00:00.000Z",
                cancelledAt: null,
                createdAt: "2026-03-02T12:00:00.000Z",
                updatedAt: "2026-03-02T12:00:00.000Z"
            };
            fake.enrollments.set(secondEnrollment.id, secondEnrollment);

            const res = await request(app)
                .post("/api/enrollments/payment-status")
                .send({
                    nationalId: "102340567",
                    phone: "88887777"
                });

            expect(res.status).toBe(200);
            expect(res.body.enrollments).toHaveLength(2);
            expect(res.body.enrollments).toEqual([
                {
                    courseName: "Pastelería Básica",
                    paymentStatus: "pending",
                    paymentUpdatedAt: null
                },
                {
                    courseName: "Repostería Francesa",
                    paymentStatus: "paid",
                    paymentUpdatedAt: "2026-03-02T12:00:00.000Z"
                }
            ]);
        });

        it("returns 200 with empty enrollments array when no match is found (identical to non-enrolled person)", async () => {
            const res = await request(app)
                .post("/api/enrollments/payment-status")
                .send({
                    nationalId: "709990888",
                    phone: "88887777"
                });

            expect(res.status).toBe(200);
            expect(res.body).toEqual({ enrollments: [] });
        });

        it("returns empty list when nationalId matches but phone is different", async () => {
            const res = await request(app)
                .post("/api/enrollments/payment-status")
                .send({
                    nationalId: SAMPLE_ENROLLMENT.idNumber,
                    phone: "87654321"
                });

            expect(res.status).toBe(200);
            expect(res.body).toEqual({ enrollments: [] });
        });

        it("normalizes inputs with spaces, hyphens, parentheses and leading plus", async () => {
            const res = await request(app)
                .post("/api/enrollments/payment-status")
                .send({
                    nationalId: " 1-0234-0567 ",
                    phone: " +506 (8888) 7777 "
                });

            expect(res.status).toBe(200);
            expect(res.body.enrollments).toHaveLength(1);
            expect(res.body.enrollments[0].courseName).toBe("Pastelería Básica");
        });

        it("returns 400 when input format is invalid", async () => {
            const invalidCases = [
                {},
                { nationalId: "102340567" },
                { phone: "88887777" },
                { nationalId: "12345", phone: "88887777" },
                { nationalId: "abc102340", phone: "88887777" },
                { nationalId: "102340567", phone: "123" }
            ];

            for (const payload of invalidCases) {
                const res = await request(app)
                    .post("/api/enrollments/payment-status")
                    .send(payload);

                expect(res.status).toBe(400);
                expect(res.body.errors).toBeDefined();
                expect(Array.isArray(res.body.errors)).toBe(true);
            }
        });

        it("guarantees response body NEVER contains nationalId, phone, fullName or internal IDs", async () => {
            const res = await request(app)
                .post("/api/enrollments/payment-status")
                .send({
                    nationalId: SAMPLE_ENROLLMENT.idNumber,
                    phone: SAMPLE_ENROLLMENT.phone
                });

            expect(res.status).toBe(200);
            const bodyStr = JSON.stringify(res.body);

            expect(bodyStr).not.toContain(SAMPLE_ENROLLMENT.idNumber);
            expect(bodyStr).not.toContain(SAMPLE_ENROLLMENT.phone);
            expect(bodyStr).not.toContain("Sofía");
            expect(bodyStr).not.toContain("Mora");
            expect(bodyStr).not.toContain(SAMPLE_ENROLLMENT.id);
            expect(bodyStr).not.toContain(SAMPLE_ENROLLMENT.courseId);
        });

        it("enforces rate limiting: 11th attempt from same IP returns 429, window resets after 10 min", async () => {
            vi.useFakeTimers({ shouldAdvanceTime: true });
            paymentStatusLookupRateLimit.reset();

            const payload = {
                nationalId: SAMPLE_ENROLLMENT.idNumber,
                phone: SAMPLE_ENROLLMENT.phone
            };

            for (let i = 0; i < 10; i++) {
                const res = await request(app)
                    .post("/api/enrollments/payment-status")
                    .send(payload);
                expect(res.status).toBe(200);
            }

            const rateLimitedRes = await request(app)
                .post("/api/enrollments/payment-status")
                .send(payload);

            expect(rateLimitedRes.status).toBe(429);
            expect(rateLimitedRes.body).toEqual({ message: "Too many attempts. Try again later." });

            vi.advanceTimersByTime(10 * 60 * 1000 + 1000);

            const afterWindowRes = await request(app)
                .post("/api/enrollments/payment-status")
                .send(payload);

            expect(afterWindowRes.status).toBe(200);

            vi.useRealTimers();
        });

        it("ensures personal data never appears in console logs or error messages", async () => {
            const logSpy = vi.spyOn(console, "log");
            const errorSpy = vi.spyOn(console, "error");

            await request(app)
                .post("/api/enrollments/payment-status")
                .send({
                    nationalId: SAMPLE_ENROLLMENT.idNumber,
                    phone: SAMPLE_ENROLLMENT.phone
                });

            await request(app)
                .post("/api/enrollments/payment-status")
                .send({
                    nationalId: "invalid-id",
                    phone: "invalid-phone"
                });

            const allLoggedOutput = [
                ...logSpy.mock.calls.flat(),
                ...errorSpy.mock.calls.flat()
            ].map(String).join(" ");

            expect(allLoggedOutput).not.toContain(SAMPLE_ENROLLMENT.idNumber);
            expect(allLoggedOutput).not.toContain(SAMPLE_ENROLLMENT.phone);
            expect(allLoggedOutput).not.toContain("Sofía");
            expect(allLoggedOutput).not.toContain("Mora");

            logSpy.mockRestore();
            errorSpy.mockRestore();
        });

        it("reflects administrative payment status updates immediately on next lookup", async () => {
            const lookup1 = await request(app)
                .post("/api/enrollments/payment-status")
                .send({
                    nationalId: SAMPLE_ENROLLMENT.idNumber,
                    phone: SAMPLE_ENROLLMENT.phone
                });

            expect(lookup1.status).toBe(200);
            expect(lookup1.body.enrollments[0].paymentStatus).toBe("pending");
            expect(lookup1.body.enrollments[0].paymentUpdatedAt).toBeNull();

            const updateRes = await request(app)
                .patch(`/api/admin/enrollments/${SAMPLE_ENROLLMENT.id}/payment-status`)
                .set(ADMIN_AUTH_HEADER)
                .send({ paymentStatus: "deposit_paid" });

            expect(updateRes.status).toBe(200);
            const expectedTimestamp = updateRes.body.paymentUpdatedAt;

            const lookup2 = await request(app)
                .post("/api/enrollments/payment-status")
                .send({
                    nationalId: SAMPLE_ENROLLMENT.idNumber,
                    phone: SAMPLE_ENROLLMENT.phone
                });

            expect(lookup2.status).toBe(200);
            expect(lookup2.body.enrollments[0].paymentStatus).toBe("deposit_paid");
            expect(lookup2.body.enrollments[0].paymentUpdatedAt).toBe(expectedTimestamp);
        });

        it("returns clean 500 when repository lookup throws unexpected error", async () => {
            fake.enrollmentRepository.lookupEnrollmentsByStudent.mockRejectedValueOnce(
                new Error("FATAL_FIRESTORE_REPLICA_DISCONNECT: socket 4040 error")
            );

            const res = await request(app)
                .post("/api/enrollments/payment-status")
                .send({
                    nationalId: SAMPLE_ENROLLMENT.idNumber,
                    phone: SAMPLE_ENROLLMENT.phone
                });

            expect(res.status).toBe(500);
            expect(res.body).toEqual({ message: "Could not lookup payment status." });
            expect(res.body.stack).toBeUndefined();
            expect(JSON.stringify(res.body)).not.toContain("FATAL_FIRESTORE_REPLICA_DISCONNECT");
        });
    });
});
