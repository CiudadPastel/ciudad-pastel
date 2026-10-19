import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

const fake = vi.hoisted(() => ({
  courses: new Map(),
  clock: 0,
  verifyIdToken: vi.fn(),
  healthQuery: vi.fn(),
  collection: vi.fn(),
  serverTimestamp: vi.fn(),
  runTransaction: vi.fn(),
  repository: {
    createCourse: vi.fn(),
    getCourses: vi.fn(),
    getCourseById: vi.fn(),
    updateCourse: vi.fn(),
    updateCourseStatus: vi.fn(),
  },
}));

// Never load local credentials or initialize a Firebase SDK in endpoint tests.
vi.mock("dotenv", () => ({ default: { config: vi.fn() } }));
vi.mock("firebase-admin/app", () => {
  throw new Error("Real Firebase app access is forbidden.");
});
vi.mock("firebase-admin/firestore", () => ({ FieldValue: { serverTimestamp: fake.serverTimestamp } }));
vi.mock("../src/config/firebase.js", () => ({
  auth: { verifyIdToken: fake.verifyIdToken },
  db: { collection: (...args) => fake.collection(...args), runTransaction: (...args) => fake.runTransaction(...args) },
}));
vi.mock("../src/repositories/course.repository.js", () => fake.repository);
// HU-A09: no confirmed enrollments in these tests (all spots free)
vi.mock("../src/repositories/enrollment.repository.js", () => ({
    countActiveEnrollmentsByCourse: async () => new Map()
}));

import app from "../src/app.js";
import { COURSE_STATUS as STATUS, toPublicCourse } from "../src/models/course.model.js";

const CREATED_AT = "2026-10-01T12:00:00.000Z";
const validInput = {
  name: "Fundamentos de pastelería",
  summary: "Aprende técnicas básicas para preparar y decorar pasteles.",
  description:
    "Un curso práctico de masas, cremas y decoración para personas que comienzan en pastelería.",
  imageUrl: "https://example.com/pastel.jpg",
  learningOutcomes: ["Preparar masas básicas", "Decorar un pastel"],
  requiredMaterials: ["Delantal", "Espátula"],
  courseType: "workshop",
  whatYouWillLearn: "Preparar masas y cremas desde cero.",
  location: "Ciudad Pastel — Florencia",
  address: "100 m norte de la escuela",
  materialsNote: "Los materiales principales están incluidos.",
  prerequisites: "haber llevado el básico",
  reservationAmount: 10000,
  priceNote: "Incluye ingredientes",
  capacity: 6,
  price: 45000,
  instructor: "Yamilena Blanco Chaves",
  schedule: {
    startDate: "2026-11-03",
    endDate: "2026-11-24",
    startTime: "18:00",
    endTime: "21:00",
    frequency: "weekly",
    weekday: "tuesday",
    scheduleNote: "Martes de 6:00 p. m. a 9:00 p. m.",
  },
};
const editableFields = Object.keys(validInput);

function timestamp() {
  fake.clock += 1;
  return new Date(Date.UTC(2026, 9, 2, 12, 0, fake.clock)).toISOString();
}

function seedCourse(status = STATUS.DRAFT, id = "course-1") {
  const course = {
    ...structuredClone(validInput),
    id,
    status,
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
  };
  fake.courses.set(id, course);
  return structuredClone(course);
}

function adminRequest(method, path) {
  return request(app)[method](path).set("Authorization", "Bearer admin-token");
}

function expectValidation(response, field) {
  expect(response.status).toBe(400);
  expect(response.body.message).toMatch(/validation/i);
  expect(response.body.errors).toEqual(
    expect.arrayContaining([expect.stringContaining(field)]),
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("GOOGLE_APPLICATION_CREDENTIALS", "");
  fake.courses.clear();
  fake.clock = 0;
  vi.spyOn(console, "error").mockImplementation(() => {});
  fake.healthQuery.mockResolvedValue({ docs: [] });
  fake.collection.mockImplementation(() => ({ limit: () => ({ get: fake.healthQuery }) }));
  fake.verifyIdToken.mockImplementation(async (token) => {
    if (token === "admin-token")
      return { uid: "admin-1", email: "admin@example.com", admin: true };
    if (token === "user-token")
      return { uid: "user-1", email: "user@example.com", admin: false };
    throw new Error("Invalid test token");
  });
  fake.repository.createCourse.mockImplementation(async (course) => {
    const now = timestamp();
    const created = {
      ...structuredClone(course),
      createdAt: now,
      updatedAt: now,
    };
    fake.courses.set(course.id, created);
    return structuredClone(created);
  });
  fake.repository.getCourses.mockImplementation(async (status) =>
    structuredClone(
      [...fake.courses.values()].filter(
        (course) => status === undefined || course.status === status,
      ),
    ),
  );
  fake.repository.getCourseById.mockImplementation(async (id) =>
    structuredClone(fake.courses.get(id) ?? null),
  );
  fake.repository.updateCourse.mockImplementation(async (id, input) => {
    const current = fake.courses.get(id);
    if (!current) return null;
    const editable = Object.fromEntries(
      editableFields.map((field) => [field, input[field]]),
    );
    const updated = {
      ...current,
      ...structuredClone(editable),
      updatedAt: timestamp(),
    };
    fake.courses.set(id, updated);
    return structuredClone(updated);
  });
  fake.repository.updateCourseStatus.mockImplementation(
    async (id, status, validateTransition) => {
      const current = fake.courses.get(id);
      if (!current) return null;
      // Use the real service's rules, including rejected transitions.
      validateTransition(current.status, current);
      const updated = { ...current, status, updatedAt: timestamp() };
      fake.courses.set(id, updated);
      return structuredClone(updated);
    },
  );
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("course creation", () => {
  it("creates a course as draft with a generated ID and editable fields", async () => {
    const response = await adminRequest("post", "/api/admin/courses").send(
      validInput,
    );
    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      ...validInput,
      status: STATUS.DRAFT,
    });
    expect(response.body.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(response.body.createdAt).toBe(response.body.updatedAt);
    expect(new Date(response.body.createdAt).toISOString()).toBe(
      response.body.createdAt,
    );
    const detail = await adminRequest(
      "get",
      `/api/admin/courses/${response.body.id}`,
    );
    expect(detail.body).toEqual(response.body);
  });

  it("ignores client-supplied protected fields on creation", async () => {
    const response = await adminRequest("post", "/api/admin/courses").send({
      ...validInput,
      id: "fake-id",
      status: STATUS.PUBLISHED,
      createdAt: "fake",
      updatedAt: "fake",
    });
    expect(response.status).toBe(201);
    expect(response.body.id).not.toBe("fake-id");
    expect(response.body.status).toBe(STATUS.DRAFT);
    expect(response.body.createdAt).not.toBe("fake");
    expect(response.body.updatedAt).not.toBe("fake");
  });

  it("trims editable strings and defaults omitted optional fields", async () => {
    const response = await adminRequest("post", "/api/admin/courses").send({
      name: `  ${validInput.name}  `,
      summary: validInput.summary,
      description: validInput.description,
    });
    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      name: validInput.name,
      imageUrl: null,
      learningOutcomes: [],
      requiredMaterials: [],
    });
  });

  it("saves a draft without planning data and stores it as null", async () => {
    const { name, summary, description } = validInput;
    const response = await adminRequest("post", "/api/admin/courses").send({
      name,
      summary,
      description,
    });
    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      status: STATUS.DRAFT,
      capacity: null,
      price: null,
      instructor: null,
      schedule: null,
    });
  });

  it("stores and returns the planning data with the course", async () => {
    const created = await adminRequest("post", "/api/admin/courses").send(
      validInput,
    );
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({
      capacity: 6,
      price: 45000,
      instructor: "Yamilena Blanco Chaves",
      schedule: validInput.schedule,
    });
    const detail = await adminRequest(
      "get",
      `/api/admin/courses/${created.body.id}`,
    );
    expect(detail.body.schedule).toEqual(validInput.schedule);
  });

  it("normalizes planning strings and an omitted end date", async () => {
    const response = await adminRequest("post", "/api/admin/courses").send({
      ...validInput,
      instructor: "  Yamilena Blanco  ",
      schedule: {
        startDate: "2026-11-03",
        startTime: "18:00",
        endTime: "21:00",
        frequency: "single",
        scheduleNote: "  Martes por la noche  ",
      },
    });
    expect(response.status).toBe(201);
    expect(response.body.instructor).toBe("Yamilena Blanco");
    expect(response.body.schedule).toEqual({
      startDate: "2026-11-03",
      endDate: null,
      startTime: "18:00",
      endTime: "21:00",
      frequency: "single",
      weekday: null,
      scheduleNote: "Martes por la noche",
    });
  });

  it.each([
    ["zero capacity", { capacity: 0 }, "capacity"],
    ["negative capacity", { capacity: -1 }, "capacity"],
    ["decimal capacity", { capacity: 6.5 }, "capacity"],
    ["text capacity", { capacity: "6" }, "capacity"],
    ["negative price", { price: -1 }, "price"],
    ["decimal price", { price: 45000.5 }, "price"],
    ["text price", { price: "45000" }, "price"],
    ["too-short instructor", { instructor: "ab" }, "instructor"],
    ["non-text instructor", { instructor: 123 }, "instructor"],
    ["non-object schedule", { schedule: "martes" }, "schedule"],
    [
      "schedule without start date",
      { schedule: { description: "Martes por la noche" } },
      "schedule.startDate",
    ],
    [
      "impossible start date",
      {
        schedule: {
          ...validInput.schedule,
          startDate: "2026-02-30",
          description: "Martes por la noche",
        },
      },
      "schedule.startDate",
    ],
    [
      "malformed start date",
      {
        schedule: {
          ...validInput.schedule,
          startDate: "03/11/2026",
          description: "Martes por la noche",
        },
      },
      "schedule.startDate",
    ],
    [
      "end date before start date",
      {
        schedule: {
          ...validInput.schedule,
          startDate: "2026-11-10",
          endDate: "2026-11-03",
          description: "Martes por la noche",
        },
      },
      "schedule.endDate",
    ],
    [
      "schedule without frequency",
      { schedule: { ...validInput.schedule, frequency: undefined } },
      "schedule.frequency",
    ],
    [
      "non-text schedule note",
      { schedule: { ...validInput.schedule, scheduleNote: 123 } },
      "schedule.scheduleNote",
    ],
    [
      "malformed start time",
      {
        schedule: {
          ...validInput.schedule,
          startDate: "2026-11-03",
          startTime: "1pm",
          description: "Martes por la noche",
        },
      },
      "schedule.startTime",
    ],
    [
      "end time before start time",
      {
        schedule: {
          ...validInput.schedule,
          startDate: "2026-11-03",
          startTime: "17:00",
          endTime: "13:00",
          description: "Martes por la noche",
        },
      },
      "schedule.endTime",
    ],
  ])("rejects %s without creating a course", async (_label, changes, field) => {
    expectValidation(
      await adminRequest("post", "/api/admin/courses").send({
        ...validInput,
        ...changes,
      }),
      field,
    );
    expect((await adminRequest("get", "/api/admin/courses")).body).toEqual([]);
  });

  it.each([
    ["missing required fields", {}, "name"],
    ["too-short name", { ...validInput, name: "ab" }, "name"],
    ["too-short summary", { ...validInput, summary: "short" }, "summary"],
    [
      "invalid image URL",
      { ...validInput, imageUrl: "ftp://example.com/image" },
      "imageUrl",
    ],
    [
      "invalid array",
      { ...validInput, learningOutcomes: "text" },
      "learningOutcomes",
    ],
    [
      "empty array item",
      { ...validInput, requiredMaterials: [" "] },
      "requiredMaterials",
    ],
  ])("rejects %s without creating a course", async (_label, input, field) => {
    expectValidation(
      await adminRequest("post", "/api/admin/courses").send(input),
      field,
    );
    expect((await adminRequest("get", "/api/admin/courses")).body).toEqual([]);
  });
});

describe("administrative list and detail", () => {
  it("lists all course statuses as a direct array", async () => {
    const courses = Object.values(STATUS).map((status, index) =>
      seedCourse(status, `course-${index}`),
    );
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
    Object.values(STATUS).forEach((value) => seedCourse(value, value));
    const response = await adminRequest(
      "get",
      `/api/admin/courses?status=${status}`,
    );
    expect(response.status).toBe(200);
    expect(response.body).toEqual([fake.courses.get(status)]);
  });

  it("rejects an invalid status filter", async () => {
    expectValidation(
      await adminRequest("get", "/api/admin/courses?status=banana"),
      "status",
    );
  });

  it("returns an existing course directly", async () => {
    const course = seedCourse();
    const response = await adminRequest(
      "get",
      `/api/admin/courses/${course.id}`,
    );
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
  it.each(Object.values(STATUS))(
    "updates editable fields while preserving %s course metadata",
    async (status) => {
      const before = seedCourse(status);
      const changes = {
        name: "Decoración avanzada",
        summary: "Aprende nuevas técnicas de decoración profesional.",
        description:
          "Practica técnicas avanzadas para decorar pasteles con distintas cremas y herramientas.",
        imageUrl: "https://example.com/decoracion.jpg",
        learningOutcomes: ["Aplicar decoraciones avanzadas"],
        requiredMaterials: ["Mangas"],
        capacity: 8,
        price: 60000,
        instructor: "Denia González Alfaro",
        schedule: {
          ...validInput.schedule,
          startDate: "2026-12-01",
          endDate: null,
          startTime: "17:00",
          endTime: "20:00",
          frequency: "single",
          weekday: null,
          scheduleNote: "Jueves de 5:00 p. m. a 8:00 p. m.",
        },
      };
      const response = await adminRequest(
        "put",
        `/api/admin/courses/${before.id}`,
      ).send({
        ...changes,
        id: "fake-id",
        status: status === STATUS.DRAFT ? STATUS.PUBLISHED : STATUS.DRAFT,
        createdAt: "fake-created",
        updatedAt: "fake-updated",
      });
      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        ...before,
        ...Object.fromEntries(["courseType", "whatYouWillLearn", "location", "address", "materialsNote", "prerequisites", "reservationAmount", "priceNote"].map(field => [field, null])),
        ...changes,
        updatedAt: expect.any(String),
      });
      expect(response.body.updatedAt).not.toBe(before.updatedAt);
      expect(response.body.updatedAt).not.toBe("fake-updated");
      expect(new Date(response.body.updatedAt).toISOString()).toBe(
        response.body.updatedAt,
      );
      expect(
        (await adminRequest("get", `/api/admin/courses/${before.id}`)).body,
      ).toEqual(response.body);
    },
  );

  it("resets omitted optional fields on full PUT", async () => {
    const before = seedCourse();
    const { name, summary, description } = validInput;
    const response = await adminRequest(
      "put",
      `/api/admin/courses/${before.id}`,
    ).send({ name, summary, description });
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      imageUrl: null,
      learningOutcomes: [],
      requiredMaterials: [],
    });
  });

  it("clears planning data on a draft when it is omitted from the PUT", async () => {
    const before = seedCourse();
    const { name, summary, description } = validInput;
    const response = await adminRequest(
      "put",
      `/api/admin/courses/${before.id}`,
    ).send({ name, summary, description });
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      capacity: null,
      price: null,
      instructor: null,
      schedule: null,
    });
  });

  it.each(["price"])(
    "rejects clearing %s on a published course without modifying it",
    async (field) => {
      const before = seedCourse(STATUS.PUBLISHED);
      const response = await adminRequest(
        "put",
        `/api/admin/courses/${before.id}`,
      ).send({ ...validInput, [field]: null });
      expectValidation(response, field);
      expect(
        (await adminRequest("get", `/api/admin/courses/${before.id}`)).body,
      ).toEqual(before);
      expect((await request(app).get("/api/courses")).body).toEqual([toPublicCourse(before)]);
    },
  );

  it("rejects invalid planning data on PUT without modifying the course", async () => {
    const before = seedCourse();
    expectValidation(
      await adminRequest("put", `/api/admin/courses/${before.id}`).send({
        ...validInput,
        capacity: 0,
      }),
      "capacity",
    );
    expect(
      (await adminRequest("get", `/api/admin/courses/${before.id}`)).body,
    ).toEqual(before);
  });

  it.each([
    ["missing required fields", {}, "name"],
    ["too-short name", { ...validInput, name: "a" }, "name"],
    [
      "invalid array item",
      { ...validInput, learningOutcomes: [123] },
      "learningOutcomes",
    ],
  ])(
    "rejects PUT with %s without modifying the course",
    async (_label, input, field) => {
      const before = seedCourse();
      expectValidation(
        await adminRequest("put", `/api/admin/courses/${before.id}`).send(
          input,
        ),
        field,
      );
      expect(
        (await adminRequest("get", `/api/admin/courses/${before.id}`)).body,
      ).toEqual(before);
    },
  );

  it("returns 404 for PUT of a missing course without creating it", async () => {
    const response = await adminRequest(
      "put",
      "/api/admin/courses/missing",
    ).send(validInput);
    expect(response.status).toBe(404);
    expect(response.body.message).toMatch(/course not found/i);
    expect(
      (await adminRequest("get", "/api/admin/courses/missing")).status,
    ).toBe(404);
  });
});

describe("status transitions, archiving and unarchiving", () => {
  it.each([
    [STATUS.DRAFT, STATUS.PUBLISHED],
    [STATUS.PUBLISHED, STATUS.DRAFT],
    [STATUS.DRAFT, STATUS.ARCHIVED],
    [STATUS.PUBLISHED, STATUS.ARCHIVED],
    [STATUS.ARCHIVED, STATUS.DRAFT],
  ])(
    "changes %s to %s while preserving content and metadata",
    async (from, to) => {
      const before = seedCourse(from);
      const response = await adminRequest(
        "patch",
        `/api/admin/courses/${before.id}/status`,
      ).send({
        status: to,
        id: "fake",
        createdAt: "fake",
        updatedAt: "fake",
        name: "forged name",
      });
      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        ...before,
        status: to,
        updatedAt: expect.any(String),
      });
      expect(response.body.updatedAt).not.toBe(before.updatedAt);
      expect(response.body.updatedAt).not.toBe("fake");
      expect(new Date(response.body.updatedAt).toISOString()).toBe(
        response.body.updatedAt,
      );
      expect(
        (await adminRequest("get", `/api/admin/courses/${before.id}`)).body,
      ).toEqual(response.body);
    },
  );

  it.each([
    [STATUS.DRAFT, STATUS.DRAFT],
    [STATUS.PUBLISHED, STATUS.PUBLISHED],
    [STATUS.ARCHIVED, STATUS.PUBLISHED],
    [STATUS.ARCHIVED, STATUS.ARCHIVED],
  ])("rejects %s to %s without modifying the course", async (from, to) => {
    const before = seedCourse(from);
    const response = await adminRequest(
      "patch",
      `/api/admin/courses/${before.id}/status`,
    ).send({ status: to });
    expect(response.status).toBe(409);
    expect(response.body.message).toContain(`from ${from} to ${to}`);
    expect(
      (await adminRequest("get", `/api/admin/courses/${before.id}`)).body,
    ).toEqual(before);
  });

  it.each([
    {},
    { status: "banana" },
    { status: null },
    { status: [STATUS.PUBLISHED] },
    [],
  ])("rejects an invalid status request %j", async (body) => {
    const before = seedCourse();
    expectValidation(
      await adminRequest(
        "patch",
        `/api/admin/courses/${before.id}/status`,
      ).send(body),
      "status",
    );
    expect(
      (await adminRequest("get", `/api/admin/courses/${before.id}`)).body,
    ).toEqual(before);
  });

  it("returns 404 for a missing status-update course without creating it", async () => {
    const response = await adminRequest(
      "patch",
      "/api/admin/courses/missing/status",
    ).send({ status: STATUS.PUBLISHED });
    expect(response.status).toBe(404);
    expect(response.body.message).toMatch(/course not found/i);
    expect(
      (await adminRequest("get", "/api/admin/courses/missing")).status,
    ).toBe(404);
  });

  it.each([STATUS.PUBLISHED, STATUS.ARCHIVED])(
    "allows a restored draft to become %s through the normal status endpoint",
    async (target) => {
      const before = seedCourse(STATUS.ARCHIVED);
      const restored = await adminRequest(
        "patch",
        `/api/admin/courses/${before.id}/status`,
      ).send({ status: STATUS.DRAFT });
      expect(restored.status).toBe(200);
      expect(restored.body).toEqual({
        ...before,
        status: STATUS.DRAFT,
        updatedAt: expect.any(String),
      });
      expect(restored.body.updatedAt).not.toBe(before.updatedAt);

      const publicCourses = await request(app).get("/api/courses");
      expect(publicCourses.status).toBe(200);
      expect(publicCourses.body).toEqual([]);

      const changed = await adminRequest(
        "patch",
        `/api/admin/courses/${before.id}/status`,
      ).send({ status: target });
      expect(changed.status).toBe(200);
      expect(changed.body).toEqual({
        ...before,
        status: target,
        updatedAt: expect.any(String),
      });
      expect(changed.body.updatedAt).not.toBe(restored.body.updatedAt);
      expect((await request(app).get("/api/courses")).body).toEqual(
        target === STATUS.PUBLISHED ? [toPublicCourse(changed.body)] : [],
      );
    },
  );

  it("rejects publishing a draft without price and keeps it hidden", async () => {
    const before = seedCourse();
    const incomplete = { ...before, price: null, instructor: null };
    fake.courses.set(before.id, incomplete);
    const response = await adminRequest(
      "patch",
      `/api/admin/courses/${before.id}/status`,
    ).send({ status: STATUS.PUBLISHED });
    expect(response.status).toBe(400);
    expect(response.body.message).toMatch(/validation/i);
    expect(response.body.errors).toEqual([
      expect.stringContaining("price"),
    ]);
    expect(
      (await adminRequest("get", `/api/admin/courses/${before.id}`)).body,
    ).toEqual(incomplete);
    expect((await request(app).get("/api/courses")).body).toEqual([]);
  });

  it("reports only missing price when a legacy course is published", async () => {
    const { capacity, price, instructor, schedule, ...legacy } = seedCourse();
    fake.courses.set(legacy.id, legacy);
    const response = await adminRequest(
      "patch",
      `/api/admin/courses/${legacy.id}/status`,
    ).send({ status: STATUS.PUBLISHED });
    expect(response.status).toBe(400);
    expect(response.body.errors).toEqual(["price is required for a published course."]);
  });

  it("publishes once the missing price is saved", async () => {
    const incomplete = { ...seedCourse(), price: null };
    fake.courses.set(incomplete.id, incomplete);
    expect(
      (
        await adminRequest(
          "patch",
          `/api/admin/courses/${incomplete.id}/status`,
        ).send({ status: STATUS.PUBLISHED })
      ).status,
    ).toBe(400);
    expect(
      (
        await adminRequest("put", `/api/admin/courses/${incomplete.id}`).send(
          validInput,
        )
      ).status,
    ).toBe(200);
    const published = await adminRequest(
      "patch",
      `/api/admin/courses/${incomplete.id}/status`,
    ).send({ status: STATUS.PUBLISHED });
    expect(published.status).toBe(200);
    expect(published.body).toMatchObject({
      status: STATUS.PUBLISHED,
      capacity: 6,
    });
  });

  it("does not require planning data to archive or restore a course", async () => {
    const { capacity, price, instructor, schedule, ...legacy } = seedCourse(
      STATUS.PUBLISHED,
    );
    fake.courses.set(legacy.id, legacy);
    expect(
      (
        await adminRequest(
          "patch",
          `/api/admin/courses/${legacy.id}/status`,
        ).send({ status: STATUS.ARCHIVED })
      ).status,
    ).toBe(200);
    expect(
      (
        await adminRequest(
          "patch",
          `/api/admin/courses/${legacy.id}/status`,
        ).send({ status: STATUS.DRAFT })
      ).status,
    ).toBe(200);
  });

  it("archives instead of removing a course and excludes it from the public listing", async () => {
    const before = seedCourse(STATUS.PUBLISHED);
    const response = await adminRequest(
      "patch",
      `/api/admin/courses/${before.id}/status`,
    ).send({ status: STATUS.ARCHIVED });
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
    expect(response.body).toEqual([toPublicCourse(published)]);
    expect(fake.verifyIdToken).not.toHaveBeenCalled();
  });

  it("exposes the planning data of published courses to visitors without internal metadata", async () => {
    seedCourse(STATUS.PUBLISHED, "published-course");
    const [course] = (await request(app).get("/api/courses")).body;
    expect(course).toMatchObject({
      capacity: 6,
      price: 45000,
      instructor: "Yamilena Blanco Chaves",
      schedule: validInput.schedule,
    });
    expect(course).not.toHaveProperty("status");
    expect(course).not.toHaveProperty("createdAt");
    expect(course).not.toHaveProperty("updatedAt");
  });

  it("cannot expose drafts by accepting a public status query", async () => {
    seedCourse(STATUS.DRAFT, "draft");
    const published = seedCourse(STATUS.PUBLISHED, "published");
    const response = await request(app).get("/api/courses?status=draft");
    expect(response.status).toBe(200);
    expect(response.body).toEqual([toPublicCourse(published)]);
  });

  it("returns an empty public array when no courses are published", async () => {
    seedCourse();
    const response = await request(app).get("/api/courses");
    expect(response.status).toBe(200);
    expect(response.body).toEqual([]);
  });

  it("sorts published courses by schedule startDate ascending, then by name, placing courses without dates last", async () => {
    fake.courses.clear();
    const c1 = seedCourse(STATUS.PUBLISHED, "c1");
    c1.name = "B Pasteles";
    c1.schedule.startDate = "2026-12-01";
    fake.courses.set("c1", c1);

    const c2 = seedCourse(STATUS.PUBLISHED, "c2");
    c2.name = "A Galletas";
    c2.schedule.startDate = "2026-11-01";
    fake.courses.set("c2", c2);

    const c3 = seedCourse(STATUS.PUBLISHED, "c3");
    c3.name = "Z Sin Fecha";
    c3.schedule = null;
    fake.courses.set("c3", c3);

    const c4 = seedCourse(STATUS.PUBLISHED, "c4");
    c4.name = "A Masas Mismo Dia";
    c4.schedule.startDate = "2026-11-01";
    fake.courses.set("c4", c4);

    const response = await request(app).get("/api/courses");
    expect(response.status).toBe(200);
    expect(response.body.map((c) => c.name)).toEqual([
      "A Galletas",
      "A Masas Mismo Dia",
      "B Pasteles",
      "Z Sin Fecha"
    ]);
  });

  describe("GET /api/courses/:id (public course detail)", () => {
    it("returns 200 with exact public keys for a published course without authentication", async () => {
      const published = seedCourse(STATUS.PUBLISHED, "published-detail");
      const response = await request(app).get(`/api/courses/${published.id}`);
      expect(response.status).toBe(200);
      expect(response.body).toEqual(toPublicCourse(published));
      expect(fake.verifyIdToken).not.toHaveBeenCalled();
      expect(Object.keys(response.body).sort()).toEqual([
        "capacity",
        "description",
        "id",
        "imageUrl",
        "instructor",
        "learningOutcomes",
        "name",
        "price",
        "remainingSpots",
        "requiredMaterials",
        "schedule",
        "summary"
      ]);
    });

    it.each([
      ["draft", STATUS.DRAFT],
      ["archived", STATUS.ARCHIVED]
    ])("returns 404 Course not found for a %s course", async (_label, status) => {
      const course = seedCourse(status, `course-${status}`);
      const response = await request(app).get(`/api/courses/${course.id}`);
      expect(response.status).toBe(404);
      expect(response.body).toEqual({ message: "Course not found." });
    });

    it("returns 404 Course not found for a nonexistent course with identical body", async () => {
      const response = await request(app).get("/api/courses/nonexistent-id");
      expect(response.status).toBe(404);
      expect(response.body).toEqual({ message: "Course not found." });
    });
  });
});

const adminEndpoints = [
  ["post", "/api/admin/courses", validInput],
  ["get", "/api/admin/courses", undefined],
  ["get", "/api/admin/courses/course-1", undefined],
  ["put", "/api/admin/courses/course-1", validInput],
  ["patch", "/api/admin/courses/course-1/status", { status: STATUS.PUBLISHED }],
];

describe("administrative authentication and authorization", () => {
  describe.each(adminEndpoints)("%s %s", (method, path, body) => {
    it.each([
      ["no token", undefined, 401, "Authentication required"],
      [
        "invalid token",
        "invalid-token",
        401,
        "Invalid or expired authentication token",
      ],
      [
        "non-admin token",
        "user-token",
        403,
        "Administrator privileges required",
      ],
    ])("rejects a request with %s", async (_label, token, status, message) => {
      const before = seedCourse();
      let call = request(app)[method](path);
      if (token) call = call.set("Authorization", `Bearer ${token}`);
      if (body) call = call.send(body);
      const response = await call;
      expect(response.status).toBe(status);
      expect(response.body).toEqual({ message });
      expect((await adminRequest("get", "/api/admin/courses")).body).toEqual([
        before,
      ]);
    });
  });
});

describe("unexpected repository failures", () => {
  it.each([
    ...adminEndpoints.map(([method, path, body]) => [
      method,
      path,
      body,
      {
        post: "createCourse",
        get: path.endsWith("course-1") ? "getCourseById" : "getCourses",
        put: "updateCourse",
        patch: "updateCourseStatus",
      }[method],
    ]),
    ["get", "/api/courses", undefined, "getCourses"],
  ])(
    "returns a safe 500 for %s %s",
    async (method, path, body, repositoryMethod) => {
      fake.repository[repositoryMethod].mockRejectedValueOnce(
        new Error("private Firestore details"),
      );
      let call =
        path === "/api/courses"
          ? request(app)[method](path)
          : adminRequest(method, path);
      if (body) call = call.send(body);
      const response = await call;
      expect(response.status).toBe(500);
      expect(response.body.message).toMatch(/^Could not /);
      expect(JSON.stringify(response.body)).not.toContain(
        "private Firestore details",
      );
    },
  );
});

describe("application routes and isolation", () => {
  it("starts the API entry point and serves health without real Firebase", async () => {
    vi.stubEnv("PORT", "0");
    vi.spyOn(console, "log").mockImplementation(() => {});
    const listen = vi.spyOn(app, "listen");
    await import("../src/index.js");
    const server = listen.mock.results[0].value;

    try {
      const response = await request(server).get("/api/health");
      expect(response.status).toBe(200);
      expect(response.body.status).toBe("ok");
      expect(fake.healthQuery).not.toHaveBeenCalled();
    } finally {
      await new Promise((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });

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
    expect(response.body.user).toEqual({
      uid: "admin-1",
      email: "admin@example.com",
    });
  });

  it("serves Swagger documentation", async () => {
    const response = await request(app).get("/api/docs").redirects(1);
    expect(response.status).toBe(200);
    expect(response.text).toContain("Swagger UI");
  });
});

const optionalTextFields = ["whatYouWillLearn", "location", "address", "materialsNote", "prerequisites", "priceNote"];
const newFields = ["courseType", ...optionalTextFields, "reservationAmount"];
const singleSchedule = {
  startDate: "2026-11-03", endDate: null, startTime: "09:00", endTime: "12:00",
  frequency: "single", weekday: null, scheduleNote: null,
};

describe("Sprint Review input contract", () => {
  it.each(["basic", "workshop", "demonstrative", "semi_demonstrative", "multi_week", "other", null])(
    "accepts courseType %s", async (courseType) => {
      const response = await adminRequest("post", "/api/admin/courses").send({ ...validInput, courseType });
      expect(response.status).toBe(201);
      expect(response.body.courseType).toBe(courseType);
    },
  );

  it.each(["unknown", "", "BASIC", 42, [], {}])("rejects invalid courseType %j", async (courseType) => {
    expectValidation(await adminRequest("post", "/api/admin/courses").send({ ...validInput, courseType }), "courseType");
    expect(fake.courses.size).toBe(0);
  });

  it.each(optionalTextFields)("trims %s and preserves free text", async (field) => {
    const response = await adminRequest("post", "/api/admin/courses").send({ ...validInput, [field]: "  Texto libre con instrucciones.  " });
    expect(response.status).toBe(201);
    expect(response.body[field]).toBe("Texto libre con instrucciones.");
  });

  it.each([...optionalTextFields, "instructor"])("normalizes blank %s to null", async (field) => {
    const response = await adminRequest("post", "/api/admin/courses").send({ ...validInput, [field]: " \n " });
    expect(response.status).toBe(201);
    expect(response.body[field]).toBeNull();
  });

  it.each(optionalTextFields)("rejects non-text and oversized %s", async (field) => {
    for (const value of [123, "x".repeat(5001)]) {
      expectValidation(await adminRequest("post", "/api/admin/courses").send({ ...validInput, [field]: value }), field);
    }
  });

  it("retains long whatYouWillLearn independently of learningOutcomes", async () => {
    const text = "x".repeat(5000);
    const response = await adminRequest("post", "/api/admin/courses").send({ ...validInput, whatYouWillLearn: text });
    expect(response.status).toBe(201);
    expect(response.body.whatYouWillLearn).toBe(text);
    expect(response.body.learningOutcomes).toEqual(validInput.learningOutcomes);
    expect(response.body.requiredMaterials).toEqual(validInput.requiredMaterials);
  });

  it.each([
    ["capacity", 1], ["capacity", 8], ["capacity", 101], ["capacity", 1000000000], ["capacity", null],
    ["price", null], ["price", 0], ["price", 50000], ["price", 1000000000],
    ["reservationAmount", null], ["reservationAmount", 0], ["reservationAmount", 10000], ["reservationAmount", 1000000000],
  ])("accepts %s = %s", async (field, value) => {
    const response = await adminRequest("post", "/api/admin/courses").send({ ...validInput, [field]: value });
    expect(response.status).toBe(201);
    expect(response.body[field]).toBe(value);
  });

  it.each([-1, 0.5, "1000", {}, []])("rejects invalid reservationAmount %j", async (reservationAmount) => {
    expectValidation(await adminRequest("post", "/api/admin/courses").send({ ...validInput, reservationAmount }), "reservationAmount");
  });

  it.each([
    null,
    singleSchedule,
    { ...singleSchedule, endDate: singleSchedule.startDate },
    { ...singleSchedule, endDate: "2026-11-04" },
    validInput.schedule,
    { ...validInput.schedule, endDate: "2027-11-03" },
    { ...singleSchedule, startDate: "2028-02-29" },
  ])("accepts coherent schedule %j", async (schedule) => {
    const response = await adminRequest("post", "/api/admin/courses").send({ ...validInput, schedule });
    expect(response.status).toBe(201);
    expect(response.body.schedule).toEqual(schedule);
  });

  it.each([
    ["frequency", undefined], ["frequency", null], ["frequency", "monthly"],
    ["weekday", undefined], ["weekday", null], ["weekday", "martes"], ["weekday", 2],
    ["startDate", "2026-02-30"], ["startDate", "2026-2-03"], ["startDate", null],
    ["endDate", "2026-02-30"], ["endDate", "2026-11-02"], ["endDate", null], ["endDate", undefined],
    ["startTime", "24:00"], ["startTime", "9:00"], ["startTime", "18:60"],
    ["startTime", null], ["startTime", undefined], ["startTime", ""],
    ["endTime", "23:60"], ["endTime", null], ["endTime", undefined],
    ["endTime", "18:00"], ["endTime", "17:59"],
    ["scheduleNote", 100], ["scheduleNote", "x".repeat(5001)],
  ])("rejects invalid schedule.%s (%s)", async (field, value) => {
    expectValidation(await adminRequest("post", "/api/admin/courses").send({
      ...validInput, schedule: { ...validInput.schedule, [field]: value },
    }), `schedule.${field}`);
    expect(fake.courses.size).toBe(0);
  });

  it.each([undefined, null, "   "])("normalizes optional scheduleNote %j", async (scheduleNote) => {
    const response = await adminRequest("post", "/api/admin/courses").send({
      ...validInput, schedule: { ...singleSchedule, scheduleNote },
    });
    expect(response.status).toBe(201);
    expect(response.body.schedule.scheduleNote).toBeNull();
  });

  it("writes only the new schedule shape and trims scheduleNote", async () => {
    const response = await adminRequest("post", "/api/admin/courses").send({
      ...validInput, schedule: { ...singleSchedule, description: "obsolete", scheduleNote: "  Traer delantal  " },
    });
    expect(response.status).toBe(201);
    expect(response.body.schedule).toEqual({ ...singleSchedule, scheduleNote: "Traer delantal" });
  });

  it.each([0, 45000])("publishes with price %s and every other optional field null", async (price) => {
    const { name, summary, description } = validInput;
    const created = await adminRequest("post", "/api/admin/courses").send({ name, summary, description, price });
    expect(created.status).toBe(201);
    for (const field of [...newFields, "capacity", "instructor", "schedule"]) expect(created.body[field]).toBeNull();
    const response = await adminRequest("patch", `/api/admin/courses/${created.body.id}/status`).send({ status: STATUS.PUBLISHED });
    expect(response.status).toBe(200);
    expect(response.body.price).toBe(price);
    expect((await request(app).get("/api/courses")).body).toEqual([toPublicCourse(response.body)]);
  });

  it.each([undefined, null, -1, 1.5, "0"])("rejects publishing stored invalid price %j without mutation", async (price) => {
    const course = { ...seedCourse(), price };
    fake.courses.set(course.id, course);
    expectValidation(await adminRequest("patch", `/api/admin/courses/${course.id}/status`).send({ status: STATUS.PUBLISHED }), "price");
    expect(fake.courses.get(course.id)).toEqual(course);
  });

  it.each(["capacity", "instructor", "schedule"])("allows clearing %s on a published course", async (field) => {
    const before = seedCourse(STATUS.PUBLISHED);
    const response = await adminRequest("put", `/api/admin/courses/${before.id}`).send({ ...validInput, [field]: null });
    expect(response.status).toBe(200);
    expect(response.body[field]).toBeNull();
    expect(response.body.status).toBe(STATUS.PUBLISHED);
    expect(response.body.price).toBe(validInput.price);
  });

  it("rejects full PUT omitting price on a published course without mutation", async () => {
    const before = seedCourse(STATUS.PUBLISHED);
    const { name, summary, description } = validInput;
    expectValidation(await adminRequest("put", `/api/admin/courses/${before.id}`).send({ name, summary, description }), "price");
    expect(fake.courses.get(before.id)).toEqual(before);
  });

  it("replaces new fields and clears omitted fields on full PUT", async () => {
    const before = seedCourse();
    const changes = Object.fromEntries(optionalTextFields.map(field => [field, "Nueva información libre"]));
    const response = await adminRequest("put", `/api/admin/courses/${before.id}`).send({
      ...validInput, ...changes, courseType: "multi_week", reservationAmount: 0,
    });
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ ...changes, courseType: "multi_week", reservationAmount: 0 });
    const { name, summary, description } = validInput;
    const cleared = await adminRequest("put", `/api/admin/courses/${before.id}`).send({ name, summary, description });
    expect(cleared.status).toBe(200);
    for (const field of newFields) expect(cleared.body[field]).toBeNull();
  });

  it("rejects invalid new fields on PUT without mutation", async () => {
    const before = seedCourse();
    for (const changes of [{ courseType: "invalid" }, { reservationAmount: -1 }, { prerequisites: [] }, { schedule: { ...singleSchedule, endTime: "00:00" } }]) {
      const response = await adminRequest("put", `/api/admin/courses/${before.id}`).send({ ...validInput, ...changes });
      expect(response.status).toBe(400);
      expect(fake.courses.get(before.id)).toEqual(before);
    }
  });
});

describe("real repository with isolated Firestore", () => {
  let documents;
  let writes;
  let repository;

  beforeEach(async () => {
    repository = await vi.importActual("../src/repositories/course.repository.js");
    documents = new Map();
    writes = [];
    const snapshot = id => ({ id, exists: documents.has(id), data: () => documents.get(id) });
    const doc = id => ({
      get: async () => snapshot(id),
      set: async data => { writes.push({ id, data }); documents.set(id, data); },
      update: async data => { writes.push({ id, data }); documents.set(id, { ...documents.get(id), ...data }); },
    });
    const query = status => ({
      doc,
      where: (_field, _operator, value) => query(value),
      get: async () => ({ docs: [...documents.keys()].filter(id => status === undefined || documents.get(id).status === status).map(snapshot) }),
    });
    fake.collection.mockImplementation(() => query());
    fake.serverTimestamp.mockImplementation(() => {
      const date = new Date(timestamp());
      return { toDate: () => date };
    });
    fake.runTransaction.mockImplementation(async callback => callback({
      get: ref => ref.get(), update: (ref, data) => ref.update(data),
    }));
    for (const method of Object.keys(fake.repository)) fake.repository[method].mockImplementation(repository[method]);
  });

  it("persists and retrieves new fields in admin and public responses", async () => {
    const created = await adminRequest("post", "/api/admin/courses").send(validInput);
    expect(created.status).toBe(201);
    expect(documents.get(created.body.id)).toMatchObject(validInput);
    expect(created.body).toMatchObject(validInput);
    expect((await adminRequest("get", `/api/admin/courses/${created.body.id}`)).body).toEqual(created.body);
    expect((await adminRequest("get", "/api/admin/courses")).body).toEqual([created.body]);
    const published = await adminRequest("patch", `/api/admin/courses/${created.body.id}/status`).send({ status: STATUS.PUBLISHED });
    expect(published.status).toBe(200);
    expect((await request(app).get("/api/courses")).body).toEqual([toPublicCourse(published.body)]);
  });

  it("persists full PUT, metadata protection and clearing optional fields", async () => {
    const created = (await adminRequest("post", "/api/admin/courses").send(validInput)).body;
    const changes = { ...validInput, ...Object.fromEntries(optionalTextFields.map(field => [field, "Información actualizada"])), courseType: "basic", price: 0, reservationAmount: 0, schedule: singleSchedule };
    const updated = await adminRequest("put", `/api/admin/courses/${created.id}`).send({ ...changes, id: "forged", status: STATUS.PUBLISHED, createdAt: "forged", updatedAt: "forged" });
    expect(updated.status).toBe(200);
    expect(updated.body).toMatchObject({ ...changes, id: created.id, status: STATUS.DRAFT, createdAt: created.createdAt });
    expect(documents.get(created.id)).toMatchObject(changes);
    expect(updated.body.updatedAt).not.toBe(created.updatedAt);
    const { name, summary, description } = validInput;
    const cleared = await adminRequest("put", `/api/admin/courses/${created.id}`).send({ name, summary, description });
    expect(cleared.status).toBe(200);
    for (const field of [...newFields, "capacity", "price", "instructor", "schedule"]) {
      expect(cleared.body[field]).toBeNull();
      expect(documents.get(created.id)[field]).toBeNull();
    }
  });

  it.each([undefined, null, { startDate: "2026-11-03", endDate: null, description: "Martes por la noche" }])(
    "normalizes legacy documents and schedule %j without writes", async (schedule) => {
      const legacy = {
        name: validInput.name, summary: validInput.summary, description: validInput.description,
        learningOutcomes: validInput.learningOutcomes, requiredMaterials: validInput.requiredMaterials,
        status: STATUS.PUBLISHED,
        createdAt: { toDate: () => new Date(CREATED_AT) }, updatedAt: { toDate: () => new Date(CREATED_AT) },
        ...(schedule === undefined ? {} : { schedule }),
      };
      documents.set("legacy", legacy);
      const detail = await adminRequest("get", "/api/admin/courses/legacy");
      expect(detail.status).toBe(200);
      for (const field of [...newFields, "capacity", "price", "instructor"]) expect(detail.body[field]).toBeNull();
      expect(detail.body).toMatchObject({ id: "legacy", status: STATUS.PUBLISHED, createdAt: CREATED_AT, updatedAt: CREATED_AT,
        learningOutcomes: validInput.learningOutcomes, requiredMaterials: validInput.requiredMaterials });
      expect(detail.body.whatYouWillLearn).toBeNull();
      expect(detail.body.schedule).toEqual(schedule ? {
        startDate: schedule.startDate, endDate: null, startTime: null, endTime: null,
        frequency: null, weekday: null, scheduleNote: schedule.description,
      } : null);
      expect((await adminRequest("get", "/api/admin/courses")).body).toEqual([detail.body]);
      expect((await request(app).get("/api/courses")).body).toEqual([toPublicCourse(detail.body)]);
      expect(writes).toEqual([]);
      expect(documents.get("legacy")).toBe(legacy);
      if (schedule) expect(legacy.schedule.description).toBe("Martes por la noche");
    },
  );

  it.each([null, "Nota nueva"])("preserves explicit scheduleNote %j over legacy description", async (scheduleNote) => {
    documents.set("legacy", { ...validInput, schedule: { startDate: "2026-11-03", endDate: "2026-11-24", description: "Nota antigua", scheduleNote },
      status: STATUS.DRAFT, createdAt: { toDate: () => new Date(CREATED_AT) }, updatedAt: { toDate: () => new Date(CREATED_AT) } });
    const course = await repository.getCourseById("legacy");
    expect(course.schedule.scheduleNote).toBe(scheduleNote);
    expect(course.schedule.endDate).toBe("2026-11-24");
    expect(writes).toEqual([]);
  });

  it("preserves archived to draft with the existing transaction", async () => {
    const created = (await adminRequest("post", "/api/admin/courses").send(validInput)).body;
    expect((await adminRequest("patch", `/api/admin/courses/${created.id}/status`).send({ status: STATUS.ARCHIVED })).status).toBe(200);
    const restored = await adminRequest("patch", `/api/admin/courses/${created.id}/status`).send({ status: STATUS.DRAFT });
    expect(restored.status).toBe(200);
    expect(restored.body).toMatchObject({ ...validInput, id: created.id, status: STATUS.DRAFT, createdAt: created.createdAt });
    expect(fake.runTransaction).toHaveBeenCalledTimes(2);
    expect(Object.keys(writes.at(-1).data).sort()).toEqual(["status", "updatedAt"]);
  });
});
