import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

const fake = vi.hoisted(() => {
    const courses = new Map();
    const requests = new Map();
    let clock = 0;
    const tick = () => new Date(Date.UTC(2026, 9, 19, 12, 0, ++clock)).toISOString();

    return {
        courses,
        requests,
        verifyIdToken: vi.fn(),
        courseRepository: {
            getCourses: vi.fn(async () => Array.from(courses.values())),
            getCourseById: vi.fn(async (id) => structuredClone(courses.get(id) ?? null))
        },
        enrollmentRepository: {
            createEnrollmentRequest: vi.fn(async (data) => {
                const now = tick();
                const created = { ...structuredClone(data), createdAt: now, updatedAt: now };
                requests.set(data.id, created);
                return structuredClone(created);
            }),
            getEnrollmentRequestById: vi.fn(async (id) => structuredClone(requests.get(id) ?? null)),
            getEnrollmentRequests: vi.fn(async (filter = {}) =>
                Array.from(requests.values())
                    .filter((r) => !filter.courseId || r.courseId === filter.courseId)
                    .filter((r) => !filter.status || r.status === filter.status)
                    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
                    .map((r) => structuredClone(r))
            ),
            getEnrollmentRequestsForPerson: vi.fn(async (courseId, idNumber) =>
                Array.from(requests.values()).filter((r) => r.courseId === courseId && r.idNumber === idNumber)
            ),
            updateEnrollmentRequestStatus: vi.fn(async (id, status) => {
                const current = requests.get(id);
                if (!current) return null;
                const updated = { ...current, status, updatedAt: tick() };
                requests.set(id, updated);
                return structuredClone(updated);
            })
        }
    };
});

// Never load credentials or touch real Firebase in these tests.
vi.mock("dotenv", () => ({ default: { config: vi.fn() } }));
vi.mock("firebase-admin/app", () => {
    throw new Error("Real Firebase app access is forbidden.");
});
vi.mock("../src/config/firebase.js", () => ({
    auth: { verifyIdToken: fake.verifyIdToken },
    db: { collection: vi.fn() }
}));
vi.mock("../src/repositories/course.repository.js", () => fake.courseRepository);
vi.mock("../src/repositories/enrollment-request.repository.js", () => fake.enrollmentRepository);

import app from "../src/app.js";
import { enrollmentRequestRateLimit } from "../src/middleware/rate-limit.middleware.js";

const VALID_REQUEST = {
    fullName: "María González Pérez",
    idType: "national",
    idNumber: "205380021",
    phone: "8888-8888"
};

function seedCourse(id, status = "published", name = "Taller de macarons") {
    fake.courses.set(id, { id, name, status, price: 30000 });
}

function submit(courseId, body = VALID_REQUEST) {
    return request(app).post(`/api/courses/${courseId}/enrollment-requests`).send(body);
}

function admin(method, path) {
    return request(app)[method](path).set("Authorization", "Bearer admin-token");
}

beforeEach(() => {
    vi.clearAllMocks();
    fake.courses.clear();
    fake.requests.clear();
    enrollmentRequestRateLimit.reset();
    vi.spyOn(console, "error").mockImplementation(() => {});
    fake.verifyIdToken.mockImplementation(async (token) => {
        if (token === "admin-token") return { uid: "admin-1", admin: true };
        if (token === "user-token") return { uid: "user-1", admin: false };
        throw new Error("Invalid token");
    });
    seedCourse("course-1");
});

describe("POST /api/courses/:id/enrollment-requests (public)", () => {
    it("saves a pending request linked to the course and returns a confirmation without personal data", async () => {
        const response = await submit("course-1");

        expect(response.status).toBe(201);
        expect(response.body).toEqual({
            id: expect.any(String),
            courseId: "course-1",
            courseName: "Taller de macarons",
            status: "pending",
            createdAt: expect.any(String),
            message: expect.stringMatching(/received/i)
        });
        expect(response.body).not.toHaveProperty("idNumber");
        expect(response.body).not.toHaveProperty("phone");

        const saved = fake.requests.get(response.body.id);
        expect(saved).toMatchObject({
            courseId: "course-1",
            courseName: "Taller de macarons",
            fullName: "María González Pérez",
            idType: "national",
            idNumber: "205380021",
            phone: "88888888",
            status: "pending"
        });
    });

    it("does not need an account", async () => {
        const response = await submit("course-1");

        expect(response.status).toBe(201);
        expect(fake.verifyIdToken).not.toHaveBeenCalled();
    });

    it("ignores protected fields sent by the visitor", async () => {
        const response = await submit("course-1", {
            ...VALID_REQUEST,
            id: "forged",
            courseId: "other-course",
            courseName: "Forged",
            status: "contacted",
            createdAt: "forged"
        });

        expect(response.status).toBe(201);
        expect(response.body.id).not.toBe("forged");
        expect(fake.requests.get(response.body.id)).toMatchObject({
            courseId: "course-1",
            courseName: "Taller de macarons",
            status: "pending"
        });
    });

    it("never creates a confirmed enrollment: only the request is stored", async () => {
        await submit("course-1");

        expect(fake.enrollmentRepository.createEnrollmentRequest).toHaveBeenCalledTimes(1);
        expect([...fake.requests.values()].every((r) => r.status === "pending")).toBe(true);
    });

    it("accepts a DIMEX", async () => {
        const response = await submit("course-1", { ...VALID_REQUEST, idType: "dimex", idNumber: "155123456789" });

        expect(response.status).toBe(201);
    });

    it.each([
        ["missing fields", {}, ["fullName", "idType", "idNumber", "phone"]],
        ["a national ID with 8 digits", { ...VALID_REQUEST, idNumber: "20538021" }, ["idNumber"]],
        ["a national ID starting with 9", { ...VALID_REQUEST, idNumber: "905380021" }, ["idNumber"]],
        ["a short DIMEX", { ...VALID_REQUEST, idType: "dimex", idNumber: "205380021" }, ["idNumber"]],
        ["a phone with 7 digits", { ...VALID_REQUEST, phone: "8888888" }, ["phone"]],
        ["an unknown ID type", { ...VALID_REQUEST, idType: "passport" }, ["idType"]]
    ])("rejects %s with 400 and clear messages", async (_label, body, fields) => {
        const response = await submit("course-1", body);

        expect(response.status).toBe(400);
        expect(response.body.message).toMatch(/validation/i);
        for (const field of fields) {
            expect(response.body.errors).toEqual(expect.arrayContaining([expect.stringContaining(field)]));
        }
        expect(fake.requests.size).toBe(0);
    });

    it.each([
        ["does not exist", null],
        ["is a draft", "draft"],
        ["is archived", "archived"]
    ])("returns 404 when the course %s", async (_label, status) => {
        if (status) seedCourse("course-x", status);

        const response = await submit("course-x");

        expect(response.status).toBe(404);
        expect(response.body.message).toBe("Course not found.");
        expect(fake.requests.size).toBe(0);
    });

    it("rejects a second active request from the same ID number for the same course", async () => {
        expect((await submit("course-1")).status).toBe(201);

        const repeated = await submit("course-1", { ...VALID_REQUEST, idNumber: "2-0538-0021", phone: "77777777" });

        expect(repeated.status).toBe(409);
        expect(repeated.body.message).toMatch(/already received/i);
        expect(fake.requests.size).toBe(1);
    });

    it("still blocks the repeat after the request was contacted", async () => {
        const first = await submit("course-1");
        await admin("patch", `/api/admin/enrollment-requests/${first.body.id}/status`).send({ status: "contacted" });

        expect((await submit("course-1")).status).toBe(409);
    });

    it("allows a new request after the previous one was discarded", async () => {
        const first = await submit("course-1");
        await admin("patch", `/api/admin/enrollment-requests/${first.body.id}/status`).send({ status: "discarded" });

        expect((await submit("course-1")).status).toBe(201);
        expect(fake.requests.size).toBe(2);
    });

    it("allows the same person to request a different course", async () => {
        seedCourse("course-2", "published", "Repostería básica");

        expect((await submit("course-1")).status).toBe(201);
        expect((await submit("course-2")).status).toBe(201);
    });

    it("limits each IP to 5 requests every 15 minutes (429)", async () => {
        for (let i = 0; i < 5; i += 1) {
            const response = await submit("course-1", { ...VALID_REQUEST, idNumber: `10000000${i}` });
            expect(response.status).toBe(201);
        }

        const blocked = await submit("course-1", { ...VALID_REQUEST, idNumber: "100000009" });

        expect(blocked.status).toBe(429);
        expect(blocked.headers["retry-after"]).toBeDefined();
        expect(fake.requests.size).toBe(5);
    });

    it("returns a safe 500 when storage fails", async () => {
        fake.enrollmentRepository.createEnrollmentRequest.mockRejectedValueOnce(new Error("private details"));

        const response = await submit("course-1");

        expect(response.status).toBe(500);
        expect(JSON.stringify(response.body)).not.toContain("private details");
    });
});

describe("/api/admin/enrollment-requests (administrator)", () => {
    async function seedRequests() {
        seedCourse("course-2", "published", "Repostería básica");
        const a = await submit("course-1", { ...VALID_REQUEST, idNumber: "111111111" });
        const b = await submit("course-2", { ...VALID_REQUEST, idNumber: "222222222" });
        const c = await submit("course-1", { ...VALID_REQUEST, idNumber: "333333333" });
        return [a.body.id, b.body.id, c.body.id];
    }

    it("lists every request with the contact data, newest first", async () => {
        const [a, , c] = await seedRequests();

        const response = await admin("get", "/api/admin/enrollment-requests");

        expect(response.status).toBe(200);
        expect(response.body).toHaveLength(3);
        expect(response.body[0].id).toBe(c);
        expect(response.body.at(-1).id).toBe(a);
        expect(response.body[0]).toMatchObject({
            fullName: "María González Pérez",
            idType: "national",
            idNumber: "333333333",
            phone: "88888888",
            courseName: "Taller de macarons",
            status: "pending"
        });
    });

    it("filters by course and by status", async () => {
        const [a] = await seedRequests();
        await admin("patch", `/api/admin/enrollment-requests/${a}/status`).send({ status: "contacted" });

        const byCourse = await admin("get", "/api/admin/enrollment-requests?courseId=course-1");
        const byStatus = await admin("get", "/api/admin/enrollment-requests?status=pending");
        const both = await admin("get", "/api/admin/enrollment-requests?courseId=course-1&status=pending");

        expect(byCourse.body.map((r) => r.courseId)).toEqual(["course-1", "course-1"]);
        expect(byStatus.body).toHaveLength(2);
        expect(both.body).toHaveLength(1);
    });

    it("rejects an unknown status filter", async () => {
        const response = await admin("get", "/api/admin/enrollment-requests?status=banana");

        expect(response.status).toBe(400);
    });

    it("returns one request's details and 404 for a missing one", async () => {
        const [a] = await seedRequests();

        expect((await admin("get", `/api/admin/enrollment-requests/${a}`)).body.id).toBe(a);
        expect((await admin("get", "/api/admin/enrollment-requests/missing")).status).toBe(404);
    });

    it.each(["contacted", "discarded", "pending"])("changes the status to %s", async (status) => {
        const [a] = await seedRequests();

        const response = await admin("patch", `/api/admin/enrollment-requests/${a}/status`).send({ status });

        expect(response.status).toBe(200);
        expect(response.body.status).toBe(status);
        expect(fake.requests.get(a).status).toBe(status);
    });

    it("rejects an invalid status change and a missing request", async () => {
        const [a] = await seedRequests();

        expect((await admin("patch", `/api/admin/enrollment-requests/${a}/status`).send({ status: "enrolled" })).status).toBe(400);
        expect((await admin("patch", "/api/admin/enrollment-requests/missing/status").send({ status: "contacted" })).status).toBe(404);
        expect(fake.requests.get(a).status).toBe("pending");
    });

    describe.each([
        ["get", "/api/admin/enrollment-requests"],
        ["get", "/api/admin/enrollment-requests/any"],
        ["patch", "/api/admin/enrollment-requests/any/status"]
    ])("%s %s protects personal data", (method, path) => {
        it.each([
            ["no token", undefined, 401],
            ["an invalid token", "bad-token", 401],
            ["a non-admin token", "user-token", 403]
        ])("rejects %s", async (_label, token, status) => {
            let call = request(app)[method](path);
            if (token) call = call.set("Authorization", `Bearer ${token}`);

            const response = await call.send({ status: "contacted" });

            expect(response.status).toBe(status);
            expect(fake.enrollmentRepository.getEnrollmentRequests).not.toHaveBeenCalled();
            expect(fake.enrollmentRepository.updateEnrollmentRequestStatus).not.toHaveBeenCalled();
        });
    });
});
