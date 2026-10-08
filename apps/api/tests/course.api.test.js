import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

const fake = vi.hoisted(() => ({
    courses: new Map(),
    clock: 0,
    verifyIdToken: vi.fn(),
    healthQuery: vi.fn(),
    repository: {
        createCourse: vi.fn(),
        getCourses: vi.fn(),
        getCourseById: vi.fn(),
        updateCourse: vi.fn(),
        updateCourseStatus: vi.fn()
    }
}));

// Never load local credentials or initialize a Firebase SDK in endpoint tests.
vi.mock("dotenv", () => ({ default: { config: vi.fn() } }));
vi.mock("firebase-admin/app", () => { throw new Error("Real Firebase app access is forbidden."); });
vi.mock("firebase-admin/firestore", () => { throw new Error("Real Firestore access is forbidden."); });
vi.mock("../src/config/firebase.js", () => ({
    auth: { verifyIdToken: fake.verifyIdToken },
    db: { collection: () => ({ limit: () => ({ get: fake.healthQuery }) }) }
}));
vi.mock("../src/repositories/course.repository.js", () => fake.repository);

import app from "../src/app.js";
import { COURSE_STATUS as STATUS } from "../src/models/course.model.js";

const CREATED_AT = "2026-10-01T12:00:00.000Z";
const validInput = {
    name: "Fundamentos de pastelería",
    summary: "Aprende técnicas básicas para preparar y decorar pasteles.",
    description: "Un curso práctico de masas, cremas y decoración para personas que comienzan en pastelería.",
    imageUrl: "https://example.com/pastel.jpg",
    learningOutcomes: ["Preparar masas básicas", "Decorar un pastel"],
    requiredMaterials: ["Delantal", "Espátula"]
};
const editableFields = Object.keys(validInput);

function timestamp() {
    fake.clock += 1;
    return new Date(Date.UTC(2026, 9, 2, 12, 0, fake.clock)).toISOString();
}

function seedCourse(status = STATUS.DRAFT, id = "course-1") {
    const course = { ...structuredClone(validInput), id, status, createdAt: CREATED_AT, updatedAt: CREATED_AT };
    fake.courses.set(id, course);
    return structuredClone(course);
}

function adminRequest(method, path) {
    return request(app)[method](path).set("Authorization", "Bearer admin-token");
}

function expectValidation(response, field) {
    expect(response.status).toBe(400);
    expect(response.body.message).toMatch(/validation/i);
    expect(response.body.errors).toEqual(expect.arrayContaining([expect.stringContaining(field)]));
}

beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("GOOGLE_APPLICATION_CREDENTIALS", "");
    fake.courses.clear();
    fake.clock = 0;
    vi.spyOn(console, "error").mockImplementation(() => {});
    fake.healthQuery.mockResolvedValue({ docs: [] });
    fake.verifyIdToken.mockImplementation(async (token) => {
        if (token === "admin-token") return { uid: "admin-1", email: "admin@example.com", admin: true };
        if (token === "user-token") return { uid: "user-1", email: "user@example.com", admin: false };
        throw new Error("Invalid test token");
    });
    fake.repository.createCourse.mockImplementation(async (course) => {
        const now = timestamp();
        const created = { ...structuredClone(course), createdAt: now, updatedAt: now };
        fake.courses.set(course.id, created);
        return structuredClone(created);
    });
    fake.repository.getCourses.mockImplementation(async (status) => structuredClone(
        [...fake.courses.values()].filter(course => status === undefined || course.status === status)
    ));
    fake.repository.getCourseById.mockImplementation(async (id) => structuredClone(fake.courses.get(id) ?? null));
    fake.repository.updateCourse.mockImplementation(async (id, input) => {
        const current = fake.courses.get(id);
        if (!current) return null;
        const editable = Object.fromEntries(editableFields.map(field => [field, input[field]]));
        const updated = { ...current, ...structuredClone(editable), updatedAt: timestamp() };
        fake.courses.set(id, updated);
        return structuredClone(updated);
    });
    fake.repository.updateCourseStatus.mockImplementation(async (id, status, validateTransition) => {
        const current = fake.courses.get(id);
        if (!current) return null;
        // Use the real service's rules, including same-state and terminal states.
        validateTransition(current.status);
        const updated = { ...current, status, updatedAt: timestamp() };
        fake.courses.set(id, updated);
        return structuredClone(updated);
    });
});

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
});

describe("course creation", () => {
    it("creates a course as draft with a generated ID and editable fields", async () => {
        const response = await adminRequest("post", "/api/admin/courses").send(validInput);
        expect(response.status).toBe(201);
        expect(response.body).toMatchObject({ ...validInput, status: STATUS.DRAFT });
        expect(response.body.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
        expect(response.body.createdAt).toBe(response.body.updatedAt);
        expect(new Date(response.body.createdAt).toISOString()).toBe(response.body.createdAt);
        const detail = await adminRequest("get", `/api/admin/courses/${response.body.id}`);
        expect(detail.body).toEqual(response.body);
    });

    it("ignores client-supplied protected fields on creation", async () => {
        const response = await adminRequest("post", "/api/admin/courses").send({
            ...validInput, id: "fake-id", status: STATUS.PUBLISHED, createdAt: "fake", updatedAt: "fake"
        });
        expect(response.status).toBe(201);
        expect(response.body.id).not.toBe("fake-id");
        expect(response.body.status).toBe(STATUS.DRAFT);
        expect(response.body.createdAt).not.toBe("fake");
        expect(response.body.updatedAt).not.toBe("fake");
    });

    it("trims editable strings and defaults omitted optional fields", async () => {
        const response = await adminRequest("post", "/api/admin/courses").send({
            name: `  ${validInput.name}  `, summary: validInput.summary, description: validInput.description
        });
        expect(response.status).toBe(201);
        expect(response.body).toMatchObject({ name: validInput.name, imageUrl: null, learningOutcomes: [], requiredMaterials: [] });
    });

    it.each([
        ["missing required fields", {}, "name"],
        ["too-short name", { ...validInput, name: "ab" }, "name"],
        ["too-short summary", { ...validInput, summary: "short" }, "summary"],
        ["invalid image URL", { ...validInput, imageUrl: "ftp://example.com/image" }, "imageUrl"],
        ["invalid array", { ...validInput, learningOutcomes: "text" }, "learningOutcomes"],
        ["empty array item", { ...validInput, requiredMaterials: [" "] }, "requiredMaterials"]
    ])("rejects %s without creating a course", async (_label, input, field) => {
        expectValidation(await adminRequest("post", "/api/admin/courses").send(input), field);
        expect((await adminRequest("get", "/api/admin/courses")).body).toEqual([]);
    });
});

describe("administrative list and detail", () => {
    it("lists all course statuses as a direct array", async () => {
        const courses = Object.values(STATUS).map((status, index) => seedCourse(status, `course-${index}`));
        const response = await adminRequest("get", "/api/admin/courses");
        expect(response.status).toBe(200);
        expect(response.body).toEqual(courses);
    });

    it("returns an empty array when there are no courses", async () => {
        const response = await adminRequest("get", "/api/admin/courses");
        expect(response.status).toBe(200);
        expect(response.body).toEqual([]);
    });

    it.each(Object.values(STATUS))("filters courses by %s", async (status) => {
        Object.values(STATUS).forEach(value => seedCourse(value, value));
        const response = await adminRequest("get", `/api/admin/courses?status=${status}`);
        expect(response.status).toBe(200);
        expect(response.body).toEqual([fake.courses.get(status)]);
    });

    it("rejects an invalid status filter", async () => {
        expectValidation(await adminRequest("get", "/api/admin/courses?status=banana"), "status");
    });

    it("returns an existing course directly", async () => {
        const course = seedCourse();
        const response = await adminRequest("get", `/api/admin/courses/${course.id}`);
        expect(response.status).toBe(200);
        expect(response.body).toEqual(course);
    });

    it("returns 404 for a missing course", async () => {
        const response = await adminRequest("get", "/api/admin/courses/missing");
        expect(response.status).toBe(404);
        expect(response.body.message).toMatch(/course not found/i);
    });
});

describe("course updates", () => {
    it.each(Object.values(STATUS))("updates editable fields while preserving %s course metadata", async (status) => {
        const before = seedCourse(status);
        const changes = {
            name: "Decoración avanzada", summary: "Aprende nuevas técnicas de decoración profesional.",
            description: "Practica técnicas avanzadas para decorar pasteles con distintas cremas y herramientas.",
            imageUrl: "https://example.com/decoracion.jpg", learningOutcomes: ["Aplicar decoraciones avanzadas"], requiredMaterials: ["Mangas"]
        };
        const response = await adminRequest("put", `/api/admin/courses/${before.id}`).send({
            ...changes, id: "fake-id", status: status === STATUS.DRAFT ? STATUS.PUBLISHED : STATUS.DRAFT,
            createdAt: "fake-created", updatedAt: "fake-updated"
        });
        expect(response.status).toBe(200);
        expect(response.body).toEqual({ ...before, ...changes, updatedAt: expect.any(String) });
        expect(response.body.updatedAt).not.toBe(before.updatedAt);
        expect(response.body.updatedAt).not.toBe("fake-updated");
        expect(new Date(response.body.updatedAt).toISOString()).toBe(response.body.updatedAt);
        expect((await adminRequest("get", `/api/admin/courses/${before.id}`)).body).toEqual(response.body);
    });

    it("resets omitted optional fields on full PUT", async () => {
        const before = seedCourse();
        const { name, summary, description } = validInput;
        const response = await adminRequest("put", `/api/admin/courses/${before.id}`).send({ name, summary, description });
        expect(response.status).toBe(200);
        expect(response.body).toMatchObject({ imageUrl: null, learningOutcomes: [], requiredMaterials: [] });
    });

    it.each([
        ["missing required fields", {}, "name"],
        ["too-short name", { ...validInput, name: "a" }, "name"],
        ["invalid array item", { ...validInput, learningOutcomes: [123] }, "learningOutcomes"]
    ])("rejects PUT with %s without modifying the course", async (_label, input, field) => {
        const before = seedCourse();
        expectValidation(await adminRequest("put", `/api/admin/courses/${before.id}`).send(input), field);
        expect((await adminRequest("get", `/api/admin/courses/${before.id}`)).body).toEqual(before);
    });

    it("returns 404 for PUT of a missing course without creating it", async () => {
        const response = await adminRequest("put", "/api/admin/courses/missing").send(validInput);
        expect(response.status).toBe(404);
        expect(response.body.message).toMatch(/course not found/i);
        expect((await adminRequest("get", "/api/admin/courses/missing")).status).toBe(404);
    });
});

describe("status transitions and archiving", () => {
    it.each([
        [STATUS.DRAFT, STATUS.PUBLISHED], [STATUS.PUBLISHED, STATUS.DRAFT],
        [STATUS.DRAFT, STATUS.ARCHIVED], [STATUS.PUBLISHED, STATUS.ARCHIVED]
    ])("changes %s to %s while preserving content and metadata", async (from, to) => {
        const before = seedCourse(from);
        const response = await adminRequest("patch", `/api/admin/courses/${before.id}/status`).send({
            status: to, id: "fake", createdAt: "fake", updatedAt: "fake", name: "forged name"
        });
        expect(response.status).toBe(200);
        expect(response.body).toEqual({ ...before, status: to, updatedAt: expect.any(String) });
        expect(response.body.updatedAt).not.toBe(before.updatedAt);
        expect(response.body.updatedAt).not.toBe("fake");
        expect(new Date(response.body.updatedAt).toISOString()).toBe(response.body.updatedAt);
        expect((await adminRequest("get", `/api/admin/courses/${before.id}`)).body).toEqual(response.body);
    });

    it.each([
        [STATUS.DRAFT, STATUS.DRAFT], [STATUS.PUBLISHED, STATUS.PUBLISHED],
        [STATUS.ARCHIVED, STATUS.DRAFT], [STATUS.ARCHIVED, STATUS.PUBLISHED], [STATUS.ARCHIVED, STATUS.ARCHIVED]
    ])("rejects %s to %s without modifying the course", async (from, to) => {
        const before = seedCourse(from);
        const response = await adminRequest("patch", `/api/admin/courses/${before.id}/status`).send({ status: to });
        expect(response.status).toBe(409);
        expect(response.body.message).toContain(`from ${from} to ${to}`);
        expect((await adminRequest("get", `/api/admin/courses/${before.id}`)).body).toEqual(before);
    });

    it.each([{}, { status: "banana" }, { status: null }, { status: [STATUS.PUBLISHED] }, []])(
        "rejects an invalid status request %j", async (body) => {
            const before = seedCourse();
            expectValidation(await adminRequest("patch", `/api/admin/courses/${before.id}/status`).send(body), "status");
            expect((await adminRequest("get", `/api/admin/courses/${before.id}`)).body).toEqual(before);
        }
    );

    it("returns 404 for a missing status-update course without creating it", async () => {
        const response = await adminRequest("patch", "/api/admin/courses/missing/status").send({ status: STATUS.PUBLISHED });
        expect(response.status).toBe(404);
        expect(response.body.message).toMatch(/course not found/i);
        expect((await adminRequest("get", "/api/admin/courses/missing")).status).toBe(404);
    });

    it("archives instead of removing a course and excludes it from the public listing", async () => {
        const before = seedCourse(STATUS.PUBLISHED);
        const response = await adminRequest("patch", `/api/admin/courses/${before.id}/status`).send({ status: STATUS.ARCHIVED });
        expect(response.status).toBe(200);
        expect(response.body.status).toBe(STATUS.ARCHIVED);
        const detail = await adminRequest("get", `/api/admin/courses/${before.id}`);
        expect(detail.status).toBe(200);
        expect(detail.body).toEqual(response.body);
        expect((await request(app).get("/api/courses")).body).toEqual([]);
    });
});

describe("public courses", () => {
    it("returns only published courses publicly without authentication", async () => {
        seedCourse(STATUS.DRAFT, "draft-course");
        const published = seedCourse(STATUS.PUBLISHED, "published-course");
        seedCourse(STATUS.ARCHIVED, "archived-course");
        const response = await request(app).get("/api/courses");
        expect(response.status).toBe(200);
        expect(response.body).toEqual([published]);
        expect(fake.verifyIdToken).not.toHaveBeenCalled();
    });

    it("cannot expose drafts by accepting a public status query", async () => {
        seedCourse(STATUS.DRAFT, "draft");
        const published = seedCourse(STATUS.PUBLISHED, "published");
        const response = await request(app).get("/api/courses?status=draft");
        expect(response.status).toBe(200);
        expect(response.body).toEqual([published]);
    });

    it("returns an empty public array when no courses are published", async () => {
        seedCourse();
        const response = await request(app).get("/api/courses");
        expect(response.status).toBe(200);
        expect(response.body).toEqual([]);
    });
});

const adminEndpoints = [
    ["post", "/api/admin/courses", validInput], ["get", "/api/admin/courses", undefined],
    ["get", "/api/admin/courses/course-1", undefined], ["put", "/api/admin/courses/course-1", validInput],
    ["patch", "/api/admin/courses/course-1/status", { status: STATUS.PUBLISHED }]
];

describe("administrative authentication and authorization", () => {
    describe.each(adminEndpoints)("%s %s", (method, path, body) => {
        it.each([
            ["no token", undefined, 401, "Authentication required"],
            ["invalid token", "invalid-token", 401, "Invalid or expired authentication token"],
            ["non-admin token", "user-token", 403, "Administrator privileges required"]
        ])("rejects a request with %s", async (_label, token, status, message) => {
            const before = seedCourse();
            let call = request(app)[method](path);
            if (token) call = call.set("Authorization", `Bearer ${token}`);
            if (body) call = call.send(body);
            const response = await call;
            expect(response.status).toBe(status);
            expect(response.body).toEqual({ message });
            expect((await adminRequest("get", "/api/admin/courses")).body).toEqual([before]);
        });
    });
});

describe("unexpected repository failures", () => {
    it.each([
        ...adminEndpoints.map(([method, path, body]) => [method, path, body,
            { post: "createCourse", get: path.endsWith("course-1") ? "getCourseById" : "getCourses", put: "updateCourse", patch: "updateCourseStatus" }[method]]),
        ["get", "/api/courses", undefined, "getCourses"]
    ])("returns a safe 500 for %s %s", async (method, path, body, repositoryMethod) => {
        fake.repository[repositoryMethod].mockRejectedValueOnce(new Error("private Firestore details"));
        let call = path === "/api/courses" ? request(app)[method](path) : adminRequest(method, path);
        if (body) call = call.send(body);
        const response = await call;
        expect(response.status).toBe(500);
        expect(response.body.message).toMatch(/^Could not /);
        expect(JSON.stringify(response.body)).not.toContain("private Firestore details");
    });
});

describe("application routes and isolation", () => {
    it("runs with no Firebase credential path", () => {
        expect(process.env.GOOGLE_APPLICATION_CREDENTIALS).toBe("");
    });

    it("serves application health", async () => {
        const response = await request(app).get("/api/health");
        expect(response.status).toBe(200);
        expect(response.body.status).toBe("ok");
    });

    it("serves mocked Firebase health without external access", async () => {
        const response = await request(app).get("/api/firebase/health");
        expect(response.status).toBe(200);
        expect(response.body.status).toBe("ok");
    });

    it("serves administrative health with the real auth middleware", async () => {
        const response = await adminRequest("get", "/api/admin/health");
        expect(response.status).toBe(200);
        expect(response.body.user).toEqual({ uid: "admin-1", email: "admin@example.com" });
    });

    it("serves Swagger documentation", async () => {
        const response = await request(app).get("/api/docs").redirects(1);
        expect(response.status).toBe(200);
        expect(response.text).toContain("Swagger UI");
    });
});
