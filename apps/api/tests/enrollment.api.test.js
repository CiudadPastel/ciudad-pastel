import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

/*
 * HU-A09 tests. The repositories are replaced by in-memory fakes that run the
 * service's validate/buildChanges callbacks the same way the real Firestore
 * transaction does.
 */
const fake = vi.hoisted(() => {
    const courses = new Map();
    const requests = new Map();
    const enrollments = new Map();
    let clock = 0;
    const tick = () => new Date(Date.UTC(2026, 9, 20, 12, 0, ++clock)).toISOString();
    const clone = (value) => structuredClone(value);
    const ofCourse = (courseId) => [...enrollments.values()].filter((e) => e.courseId === courseId).map(clone);

    return {
        courses,
        requests,
        enrollments,
        tick,
        verifyIdToken: vi.fn(),
        courseRepository: {
            getCourses: vi.fn(async (status) =>
                [...courses.values()].filter((c) => !status || c.status === status).map(clone)
            ),
            getCourseById: vi.fn(async (id) => clone(courses.get(id) ?? null))
        },
        requestRepository: {
            createEnrollmentRequest: vi.fn(async (data) => {
                const now = tick();
                const created = { ...clone(data), enrollmentId: null, createdAt: now, updatedAt: now };
                requests.set(data.id, created);
                return clone(created);
            }),
            getEnrollmentRequestById: vi.fn(async (id) => clone(requests.get(id) ?? null)),
            getEnrollmentRequests: vi.fn(async () => [...requests.values()].map(clone)),
            getEnrollmentRequestsForPerson: vi.fn(async (courseId, idNumber) =>
                [...requests.values()].filter((r) => r.courseId === courseId && r.idNumber === idNumber)
            ),
            updateEnrollmentRequestStatus: vi.fn(async (id, status) => {
                const current = requests.get(id);
                if (!current) return null;
                const updated = { ...current, status, updatedAt: tick() };
                requests.set(id, updated);
                return clone(updated);
            })
        },
        enrollmentRepository: {
            createEnrollment: vi.fn(async (enrollment, { validate, enrollmentRequestId = null }) => {
                const course = clone(courses.get(enrollment.courseId) ?? null);
                const request = enrollmentRequestId ? clone(requests.get(enrollmentRequestId) ?? null) : null;
                const courseRequests = [...requests.values()].filter((r) => r.courseId === enrollment.courseId).map(clone);

                const toConfirm = validate({
                    course,
                    enrollments: ofCourse(enrollment.courseId),
                    request,
                    requests: courseRequests
                });

                const now = tick();
                const saved = {
                    ...clone(enrollment),
                    enrollmentRequestId: toConfirm?.id ?? enrollment.enrollmentRequestId ?? null,
                    confirmedAt: now,
                    cancelledAt: null,
                    createdAt: now,
                    updatedAt: now
                };
                enrollments.set(enrollment.id, saved);
                if (toConfirm) {
                    requests.set(toConfirm.id, {
                        ...requests.get(toConfirm.id),
                        status: "confirmed",
                        enrollmentId: enrollment.id,
                        updatedAt: now
                    });
                }
                return clone(saved);
            }),
            getEnrollmentById: vi.fn(async (id) => clone(enrollments.get(id) ?? null)),
            getEnrollmentsByCourse: vi.fn(async (courseId) => ofCourse(courseId)),
            updateEnrollment: vi.fn(async (id, buildChanges) => {
                const current = enrollments.get(id);
                if (!current) return null;
                const changes = buildChanges({
                    enrollment: clone(current),
                    course: clone(courses.get(current.courseId) ?? null),
                    enrollments: ofCourse(current.courseId)
                });
                const updated = { ...current, ...changes, updatedAt: tick() };
                if (changes.status === "cancelled" && current.status !== "cancelled") updated.cancelledAt = updated.updatedAt;
                if (changes.status === "enrolled") updated.cancelledAt = null;
                enrollments.set(id, updated);
                return clone(updated);
            }),
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
            countActiveEnrollmentsByCourse: vi.fn(async () => {
                const counts = new Map();
                for (const e of enrollments.values()) {
                    if (e.status === "enrolled") counts.set(e.courseId, (counts.get(e.courseId) ?? 0) + 1);
                }
                return counts;
            }),
            getActiveEnrollmentsByIdNumber: vi.fn(async (idNumber) =>
                [...enrollments.values()].filter((e) => e.idNumber === idNumber && e.status === "enrolled").map(clone)
            )
        }
    };
});

vi.mock("dotenv", () => ({ default: { config: vi.fn() } }));
vi.mock("firebase-admin/app", () => {
    throw new Error("Real Firebase app access is forbidden.");
});
vi.mock("../src/config/firebase.js", () => ({
    auth: { verifyIdToken: fake.verifyIdToken },
    db: { collection: vi.fn() }
}));
vi.mock("../src/repositories/course.repository.js", () => fake.courseRepository);
vi.mock("../src/repositories/enrollment-request.repository.js", () => fake.requestRepository);
vi.mock("../src/repositories/enrollment.repository.js", () => fake.enrollmentRepository);

import app from "../src/app.js";
import { enrollmentRequestRateLimit } from "../src/middleware/rate-limit.middleware.js";
import { findActiveEnrollments, isStudentEnrolled } from "../src/services/enrollment.service.js";

const ANA = { fullName: "Ana Mora Jiménez", idType: "national", idNumber: "105380021", phone: "88887777" };
const LUIS = { fullName: "Luis Ramírez Solano", idType: "dimex", idNumber: "155123456789", phone: "70001234" };
const SOFIA = { fullName: "Sofía Vargas", idType: "national", idNumber: "205380021", phone: "60001111" };

function seedCourse(id = "course-1", { status = "published", capacity = 2, name = "Taller de macarons" } = {}) {
    fake.courses.set(id, {
        id, name, status, capacity, price: 30000,
        summary: "Resumen", description: "Descripción", imageUrl: null,
        learningOutcomes: [], requiredMaterials: [], instructor: null, schedule: null
    });
}

function seedRequest(id, person = ANA, { courseId = "course-1", status = "pending" } = {}) {
    fake.requests.set(id, {
        id, courseId, courseName: fake.courses.get(courseId)?.name ?? "Curso",
        ...person, status, enrollmentId: null, createdAt: fake.tick(), updatedAt: fake.tick()
    });
}

const admin = (method, path) => request(app)[method](path).set("Authorization", "Bearer admin-token");
const register = (courseId, body) => admin("post", `/api/admin/courses/${courseId}/enrollments`).send(body);
const confirm = (requestId, body = {}) => admin("post", `/api/admin/enrollment-requests/${requestId}/confirm`).send(body);
const listOf = (courseId, query = "") => admin("get", `/api/admin/courses/${courseId}/enrollments${query}`);
const patch = (id, body) => admin("patch", `/api/admin/enrollments/${id}`).send(body);

beforeEach(() => {
    vi.clearAllMocks();
    fake.courses.clear();
    fake.requests.clear();
    fake.enrollments.clear();
    enrollmentRequestRateLimit.reset();
    vi.spyOn(console, "error").mockImplementation(() => {});
    fake.verifyIdToken.mockImplementation(async (token) => {
        if (token === "admin-token") return { uid: "admin-1", admin: true };
        if (token === "user-token") return { uid: "user-1", admin: false };
        throw new Error("Invalid token");
    });
    seedCourse();
});

describe("POST /api/admin/courses/:courseId/enrollments (manual registration)", () => {
    it("registers a student linked to the course as enrolled, without dashes or spaces", async () => {
        const response = await register("course-1", { ...ANA, idNumber: "1-0538-0021", phone: "8888 7777", note: "  Pagó por SINPE  " });

        expect(response.status).toBe(201);
        expect(response.body).toMatchObject({
            id: expect.any(String),
            courseId: "course-1",
            courseName: "Taller de macarons",
            fullName: "Ana Mora Jiménez",
            idType: "national",
            idNumber: "105380021",
            phone: "88887777",
            note: "Pagó por SINPE",
            status: "enrolled",
            enrollmentRequestId: null,
            confirmedAt: expect.any(String)
        });
    });

    it("rejects invalid data with 400 and clear messages", async () => {
        const response = await register("course-1", { fullName: "A", idType: "national", idNumber: "905380021", phone: "123" });

        expect(response.status).toBe(400);
        expect(response.body.errors).toEqual(expect.arrayContaining([
            expect.stringContaining("fullName"),
            expect.stringContaining("idNumber"),
            expect.stringContaining("phone")
        ]));
        expect(fake.enrollments.size).toBe(0);
    });

    it("rejects a note longer than 500 characters", async () => {
        const response = await register("course-1", { ...ANA, note: "x".repeat(501) });

        expect(response.status).toBe(400);
        expect(response.body.errors).toEqual([expect.stringContaining("note")]);
    });

    it("rejects enrolling the same person twice in the same course (409 ALREADY_ENROLLED)", async () => {
        await register("course-1", ANA);

        const repeated = await register("course-1", { ...ANA, idNumber: "1 0538 0021", phone: "60000000" });

        expect(repeated.status).toBe(409);
        expect(repeated.body.code).toBe("ALREADY_ENROLLED");
        expect(fake.enrollments.size).toBe(1);
    });

    it("rejects enrollments beyond the capacity (409 COURSE_FULL)", async () => {
        expect((await register("course-1", ANA)).status).toBe(201);
        expect((await register("course-1", LUIS)).status).toBe(201);

        const third = await register("course-1", SOFIA);

        expect(third.status).toBe(409);
        expect(third.body.code).toBe("COURSE_FULL");
        expect(third.body.message).toMatch(/full/i);
    });

    it("has no limit when the course has no capacity", async () => {
        seedCourse("open", { capacity: null });

        for (const person of [ANA, LUIS, SOFIA]) {
            expect((await register("open", person)).status).toBe(201);
        }
    });

    it("rejects archived (409) and missing (404) courses", async () => {
        seedCourse("old", { status: "archived" });

        const archived = await register("old", ANA);
        const missing = await register("nope", ANA);

        expect(archived.status).toBe(409);
        expect(archived.body.code).toBe("COURSE_ARCHIVED");
        expect(missing.status).toBe(404);
    });

    it("allows a draft course (the administrator may enroll before publishing)", async () => {
        seedCourse("draft", { status: "draft" });

        expect((await register("draft", ANA)).status).toBe(201);
    });

    it("marks the person's pending request for the course as confirmed", async () => {
        seedRequest("req-1", ANA);

        const response = await register("course-1", ANA);

        expect(response.body.enrollmentRequestId).toBe("req-1");
        expect(fake.requests.get("req-1")).toMatchObject({ status: "confirmed", enrollmentId: response.body.id });
    });
});

describe("POST /api/admin/enrollment-requests/:id/confirm", () => {
    it("creates the enrollment from the request data and marks the request as confirmed", async () => {
        seedRequest("req-1", ANA);

        const response = await confirm("req-1", { note: "Pagó por SINPE" });

        expect(response.status).toBe(201);
        expect(response.body).toMatchObject({
            ...ANA,
            courseId: "course-1",
            enrollmentRequestId: "req-1",
            note: "Pagó por SINPE",
            status: "enrolled"
        });
        expect(fake.requests.get("req-1")).toMatchObject({ status: "confirmed", enrollmentId: response.body.id });
    });

    it("lets the administrator correct the data while confirming", async () => {
        seedRequest("req-1", ANA);

        const response = await confirm("req-1", { phone: "8333-4444", fullName: "Ana María Mora Jiménez" });

        expect(response.status).toBe(201);
        expect(response.body).toMatchObject({ phone: "83334444", fullName: "Ana María Mora Jiménez", idNumber: ANA.idNumber });
    });

    it("works for a contacted request", async () => {
        seedRequest("req-1", ANA, { status: "contacted" });

        expect((await confirm("req-1")).status).toBe(201);
    });

    it("cannot process the same request twice (409 REQUEST_ALREADY_CONFIRMED)", async () => {
        seedRequest("req-1", ANA);
        await confirm("req-1");

        const again = await confirm("req-1");

        expect(again.status).toBe(409);
        expect(again.body.code).toBe("REQUEST_ALREADY_CONFIRMED");
        expect(fake.enrollments.size).toBe(1);
    });

    it("rejects a discarded request (409 REQUEST_DISCARDED)", async () => {
        seedRequest("req-1", ANA, { status: "discarded" });

        const response = await confirm("req-1");

        expect(response.status).toBe(409);
        expect(response.body.code).toBe("REQUEST_DISCARDED");
    });

    it("rejects confirming when the course is full and keeps the request pending", async () => {
        seedCourse("course-1", { capacity: 1 });
        await register("course-1", LUIS);
        seedRequest("req-1", ANA);

        const response = await confirm("req-1");

        expect(response.status).toBe(409);
        expect(response.body.code).toBe("COURSE_FULL");
        expect(fake.requests.get("req-1").status).toBe("pending");
    });

    it("rejects a person already enrolled and returns 404 for a missing request", async () => {
        await register("course-1", ANA);
        seedRequest("req-1", ANA);

        expect((await confirm("req-1")).body.code).toBe("ALREADY_ENROLLED");
        expect((await confirm("missing")).status).toBe(404);
    });

    it("a confirmed request can no longer change its follow-up status", async () => {
        seedRequest("req-1", ANA);
        await confirm("req-1");

        const response = await admin("patch", "/api/admin/enrollment-requests/req-1/status").send({ status: "pending" });

        expect(response.status).toBe(409);
        expect(response.body.code).toBe("REQUEST_ALREADY_CONFIRMED");
    });

    it("\"confirmed\" cannot be set by hand through the status endpoint", async () => {
        seedRequest("req-1", ANA);

        const response = await admin("patch", "/api/admin/enrollment-requests/req-1/status").send({ status: "confirmed" });

        expect(response.status).toBe(400);
        expect(fake.enrollments.size).toBe(0);
    });

    it("a confirmed person cannot send a new public request for the same course", async () => {
        seedRequest("req-1", ANA);
        await confirm("req-1");

        const response = await request(app).post("/api/courses/course-1/enrollment-requests").send(ANA);

        expect(response.status).toBe(409);
    });
});

describe("GET /api/admin/courses/:courseId/enrollments", () => {
    it("lists the course's students, active first, and filters by status", async () => {
        const ana = (await register("course-1", ANA)).body;
        await register("course-1", LUIS);
        await patch(ana.id, { status: "cancelled" });
        seedCourse("course-2");
        await register("course-2", SOFIA);

        const all = await listOf("course-1");
        const active = await listOf("course-1", "?status=enrolled");

        expect(all.status).toBe(200);
        expect(all.body.map((e) => [e.fullName, e.status])).toEqual([
            ["Luis Ramírez Solano", "enrolled"],
            ["Ana Mora Jiménez", "cancelled"]
        ]);
        expect(active.body.map((e) => e.fullName)).toEqual(["Luis Ramírez Solano"]);
    });

    it("returns 404 for a missing course and 400 for an unknown status", async () => {
        expect((await listOf("nope")).status).toBe(404);
        expect((await listOf("course-1", "?status=banana")).status).toBe(400);
    });
});

describe("PATCH /api/admin/enrollments/:id", () => {
    it("cancels an enrollment and frees the spot", async () => {
        const ana = (await register("course-1", ANA)).body;
        await register("course-1", LUIS);
        expect((await register("course-1", SOFIA)).body.code).toBe("COURSE_FULL");

        const cancelled = await patch(ana.id, { status: "cancelled" });

        expect(cancelled.status).toBe(200);
        expect(cancelled.body).toMatchObject({ status: "cancelled", cancelledAt: expect.any(String) });
        expect((await register("course-1", SOFIA)).status).toBe(201);
    });

    it("corrects the data and the note", async () => {
        const ana = (await register("course-1", ANA)).body;

        const response = await patch(ana.id, { phone: "8111-2222", note: "Pagó la reserva" });

        expect(response.status).toBe(200);
        expect(response.body).toMatchObject({ phone: "81112222", note: "Pagó la reserva", idNumber: ANA.idNumber });
    });

    it("re-enrolls a cancelled student only if there is a spot", async () => {
        const ana = (await register("course-1", ANA)).body;
        await patch(ana.id, { status: "cancelled" });
        await register("course-1", LUIS);
        await register("course-1", SOFIA);

        const full = await patch(ana.id, { status: "enrolled" });
        expect(full.status).toBe(409);
        expect(full.body.code).toBe("COURSE_FULL");

        const luis = [...fake.enrollments.values()].find((e) => e.idNumber === LUIS.idNumber);
        await patch(luis.id, { status: "cancelled" });

        const back = await patch(ana.id, { status: "enrolled" });
        expect(back.status).toBe(200);
        expect(back.body).toMatchObject({ status: "enrolled", cancelledAt: null });
    });

    it("rejects changing the ID number to one already enrolled in the course", async () => {
        const ana = (await register("course-1", ANA)).body;
        await register("course-1", LUIS);

        const response = await patch(ana.id, { idType: "dimex", idNumber: LUIS.idNumber });

        expect(response.status).toBe(409);
        expect(response.body.code).toBe("ALREADY_ENROLLED");
    });

    it.each([
        ["an empty body", {}],
        ["an unknown status", { status: "graduated" }],
        ["an invalid phone", { phone: "123" }]
    ])("rejects %s with 400", async (_label, body) => {
        const ana = (await register("course-1", ANA)).body;

        expect((await patch(ana.id, body)).status).toBe(400);
    });

    it("returns 404 for a missing enrollment", async () => {
        expect((await patch("missing", { status: "cancelled" })).status).toBe(404);
    });
});

describe("Remaining spots on the public endpoints (HU-A04)", () => {
    it("shows capacity minus active enrollments, and frees the spot when cancelled", async () => {
        seedCourse("open", { capacity: null, name: "Curso sin cupo definido" });
        const ana = (await register("course-1", ANA)).body;

        const list = await request(app).get("/api/courses");
        const detail = await request(app).get("/api/courses/course-1");

        expect(list.body.find((c) => c.id === "course-1").remainingSpots).toBe(1);
        expect(list.body.find((c) => c.id === "open").remainingSpots).toBeNull();
        expect(detail.body.remainingSpots).toBe(1);

        await patch(ana.id, { status: "cancelled" });
        expect((await request(app).get("/api/courses/course-1")).body.remainingSpots).toBe(2);
    });

    it("never goes below zero and does not expose students", async () => {
        await register("course-1", ANA);
        await register("course-1", LUIS);

        const detail = await request(app).get("/api/courses/course-1");

        expect(detail.body.remainingSpots).toBe(0);
        expect(JSON.stringify(detail.body)).not.toContain(ANA.idNumber);
    });
});

describe("Student lookup for recipe book access (HU-A06)", () => {
    it("finds an active enrollment only with the right ID number AND phone", async () => {
        const ana = (await register("course-1", ANA)).body;

        expect(await findActiveEnrollments({ idNumber: "1-0538-0021", phone: "8888-7777" }))
            .toEqual([expect.objectContaining({ id: ana.id, courseId: "course-1" })]);
        expect(await findActiveEnrollments({ idNumber: ANA.idNumber, phone: "80000000" })).toEqual([]);
        expect(await findActiveEnrollments({ idNumber: "", phone: ANA.phone })).toEqual([]);
        expect(await isStudentEnrolled("course-1", ANA.idNumber, ANA.phone)).toBe(true);
        expect(await isStudentEnrolled("course-2", ANA.idNumber, ANA.phone)).toBe(false);
    });

    it("does not find cancelled enrollments", async () => {
        const ana = (await register("course-1", ANA)).body;
        await patch(ana.id, { status: "cancelled" });

        expect(await isStudentEnrolled("course-1", ANA.idNumber, ANA.phone)).toBe(false);
    });
});

describe("Only administrators can manage enrollments", () => {
    describe.each([
        ["post", "/api/admin/courses/course-1/enrollments"],
        ["get", "/api/admin/courses/course-1/enrollments"],
        ["post", "/api/admin/enrollment-requests/req-1/confirm"],
        ["patch", "/api/admin/enrollments/any"]
    ])("%s %s", (method, path) => {
        it.each([
            ["no token", undefined, 401],
            ["an invalid token", "bad", 401],
            ["a non-admin token", "user-token", 403]
        ])("rejects %s", async (_label, token, status) => {
            seedRequest("req-1", ANA);
            let call = request(app)[method](path);
            if (token) call = call.set("Authorization", `Bearer ${token}`);

            const response = await call.send(ANA);

            expect(response.status).toBe(status);
            expect(fake.enrollmentRepository.createEnrollment).not.toHaveBeenCalled();
            expect(fake.enrollmentRepository.getEnrollmentsByCourse).not.toHaveBeenCalled();
            expect(fake.enrollmentRepository.updateEnrollment).not.toHaveBeenCalled();
        });
    });

    it("returns a safe 500 when storage fails", async () => {
        fake.enrollmentRepository.createEnrollment.mockRejectedValueOnce(new Error("private details"));

        const response = await register("course-1", ANA);

        expect(response.status).toBe(500);
        expect(JSON.stringify(response.body)).not.toContain("private details");
    });
});
