import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

const fake = vi.hoisted(() => {
    const courses = new Map();
    let clock = 0;
    const timestamp = () => {
        clock += 1;
        return new Date(Date.UTC(2026, 9, 2, 12, 0, clock)).toISOString();
    };

    return {
        courses,
        timestamp,
        verifyIdToken: vi.fn(),
        collection: vi.fn()
    };
});

// Avoid real Firebase credentials or connections
vi.mock("dotenv", () => ({ default: { config: vi.fn() } }));
vi.mock("firebase-admin/app", () => {
    throw new Error("Real Firebase app access is forbidden.");
});
vi.mock("firebase-admin/firestore", () => ({
    FieldValue: {
        serverTimestamp: () => ({
            toDate: () => new Date(fake.timestamp())
        })
    }
}));
vi.mock("../src/config/firebase.js", () => ({
    auth: { verifyIdToken: fake.verifyIdToken },
    db: {
        collection: (...args) => fake.collection(...args)
    }
}));
vi.mock("../src/repositories/enrollment.repository.js", () => ({
    countActiveEnrollmentsByCourse: async () => new Map()
}));

import app from "../src/app.js";
import { COURSE_STATUS } from "../src/models/course.model.js";

const ADMIN_TOKEN = "valid-admin-token";
const USER_TOKEN = "regular-user-token";
const ADMIN_AUTH_HEADER = { Authorization: `Bearer ${ADMIN_TOKEN}` };
const USER_AUTH_HEADER = { Authorization: `Bearer ${USER_TOKEN}` };

const VALID_BASE_COURSE = {
    name: "Taller Especial de Panes y Masas",
    summary: "Aprende a preparar masas dulces y panes tradicionales para ocasiones especiales.",
    description: "Taller teórico-práctico de técnicas de fermentación, amasado manual y horneado artesanal.",
    imageUrl: "https://example.com/panes.jpg",
    learningOutcomes: ["Técnica de fermentación lenta", "Moldeado de panes dulces"],
    requiredMaterials: ["Tazón de acero inoxidable", "Rasqueta de panadería"],
    courseType: "workshop",
    capacity: 8,
    price: 35000,
    instructor: "Chef Mariana Morales",
    schedule: {
        startDate: "2026-12-01",
        endDate: "2026-12-08",
        startTime: "14:00",
        endTime: "18:00",
        frequency: "weekly",
        weekday: "tuesday",
        scheduleNote: "Martes por la tarde"
    }
};

function setupFirestoreMock() {
    fake.collection.mockImplementation((collectionName) => {
        if (collectionName !== "courses") {
            return {
                limit: () => ({ get: async () => ({ docs: [] }) })
            };
        }

        const buildQuery = (filters = {}) => ({
            where: (field, op, val) => buildQuery({ ...filters, [field]: val }),
            get: async () => {
                const entries = [...fake.courses.entries()].filter(([_id, data]) => {
                    for (const [k, v] of Object.entries(filters)) {
                        if (data[k] !== v) return false;
                    }
                    return true;
                });
                return {
                    docs: entries.map(([id, data]) => ({
                        id,
                        data: () => ({ ...data })
                    }))
                };
            }
        });

        return {
            ...buildQuery(),
            doc: (id) => ({
                get: async () => {
                    const data = fake.courses.get(id);
                    return {
                        id,
                        exists: Boolean(data),
                        data: () => data ? { ...data } : undefined
                    };
                },
                set: async (data) => {
                    const now = new Date(fake.timestamp());
                    const stored = {
                        ...data,
                        createdAt: { toDate: () => now },
                        updatedAt: { toDate: () => now }
                    };
                    fake.courses.set(id, stored);
                },
                update: async (patch) => {
                    const current = fake.courses.get(id);
                    if (!current) {
                        const err = new Error("Document not found");
                        err.code = 5;
                        throw err;
                    }
                    const now = new Date(fake.timestamp());
                    const updated = {
                        ...current,
                        ...patch,
                        updatedAt: { toDate: () => now }
                    };
                    fake.courses.set(id, updated);
                }
            }),
            add: async (data) => {
                const id = `course-test-${fake.courses.size + 1}`;
                const now = new Date(fake.timestamp());
                const stored = {
                    ...data,
                    createdAt: { toDate: () => now },
                    updatedAt: { toDate: () => now }
                };
                fake.courses.set(id, stored);
                return {
                    id,
                    get: async () => ({
                        id,
                        exists: true,
                        data: () => ({ ...stored })
                    })
                };
            }
        };
    });
}

describe("Seasonal Course Management API (HU-A08 / CIU-14 - Rama 2)", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        fake.courses.clear();
        setupFirestoreMock();

        fake.verifyIdToken.mockImplementation(async (token) => {
            if (token === ADMIN_TOKEN) {
                return { uid: "admin-1", email: "admin@ciudadpastel.com", admin: true };
            }
            if (token === USER_TOKEN) {
                return { uid: "user-1", email: "user@example.com", admin: false };
            }
            throw new Error("Invalid or expired token");
        });
    });

    describe("POST /api/admin/courses (Creating courses with seasonal data)", () => {
        it("creates a draft course with a valid seasonName", async () => {
            const res = await request(app)
                .post("/api/admin/courses")
                .set(ADMIN_AUTH_HEADER)
                .send({
                    ...VALID_BASE_COURSE,
                    seasonName: "Navidad 2026"
                });

            expect(res.status).toBe(201);
            expect(res.body.seasonName).toBe("Navidad 2026");
            expect(res.body.status).toBe(COURSE_STATUS.DRAFT);
            expect(res.body.id).toBeDefined();

            // Verifies in-memory database storage
            const stored = fake.courses.get(res.body.id);
            expect(stored.seasonName).toBe("Navidad 2026");
            expect(stored.status).toBe(COURSE_STATUS.DRAFT);
        });

        it("creates a course with seasonName: null when omitted", async () => {
            const res = await request(app)
                .post("/api/admin/courses")
                .set(ADMIN_AUTH_HEADER)
                .send(VALID_BASE_COURSE);

            expect(res.status).toBe(201);
            expect(res.body.seasonName).toBeNull();

            const stored = fake.courses.get(res.body.id);
            expect(stored.seasonName).toBeNull();
        });

        it("trims leading and trailing whitespace from seasonName on creation", async () => {
            const res = await request(app)
                .post("/api/admin/courses")
                .set(ADMIN_AUTH_HEADER)
                .send({
                    ...VALID_BASE_COURSE,
                    seasonName: "   Especial San Valentín 2026   "
                });

            expect(res.status).toBe(201);
            expect(res.body.seasonName).toBe("Especial San Valentín 2026");
        });

        it("stores empty string seasonName as null on creation", async () => {
            const res = await request(app)
                .post("/api/admin/courses")
                .set(ADMIN_AUTH_HEADER)
                .send({
                    ...VALID_BASE_COURSE,
                    seasonName: "     "
                });

            expect(res.status).toBe(201);
            expect(res.body.seasonName).toBeNull();
        });

        it("rejects invalid seasonName with 400 ValidationError without creating the course", async () => {
            const invalidCases = [
                { value: "X", expectedError: "seasonName must contain at least 2 characters." },
                { value: "A".repeat(61), expectedError: "seasonName must not exceed 60 characters." },
                { value: 12345, expectedError: "seasonName must be a string." }
            ];

            for (const { value, expectedError } of invalidCases) {
                const countBefore = fake.courses.size;
                const res = await request(app)
                    .post("/api/admin/courses")
                    .set(ADMIN_AUTH_HEADER)
                    .send({
                        ...VALID_BASE_COURSE,
                        seasonName: value
                    });

                expect(res.status).toBe(400);
                expect(res.body.message).toMatch(/validation/i);
                expect(res.body.errors).toContain(expectedError);
                expect(fake.courses.size).toBe(countBefore);
            }
        });
    });

    describe("PUT /api/admin/courses/:id (Updating seasonal data)", () => {
        it("sets seasonName on an existing course that had none", async () => {
            const created = await request(app)
                .post("/api/admin/courses")
                .set(ADMIN_AUTH_HEADER)
                .send(VALID_BASE_COURSE);

            expect(created.status).toBe(201);
            expect(created.body.seasonName).toBeNull();

            const updateRes = await request(app)
                .put(`/api/admin/courses/${created.body.id}`)
                .set(ADMIN_AUTH_HEADER)
                .send({
                    ...VALID_BASE_COURSE,
                    seasonName: "Pascua 2026"
                });

            expect(updateRes.status).toBe(200);
            expect(updateRes.body.seasonName).toBe("Pascua 2026");

            const stored = fake.courses.get(created.body.id);
            expect(stored.seasonName).toBe("Pascua 2026");
        });

        it("changes seasonName to a different season", async () => {
            const created = await request(app)
                .post("/api/admin/courses")
                .set(ADMIN_AUTH_HEADER)
                .send({
                    ...VALID_BASE_COURSE,
                    seasonName: "Halloween 2026"
                });

            expect(created.status).toBe(201);
            expect(created.body.seasonName).toBe("Halloween 2026");

            const updateRes = await request(app)
                .put(`/api/admin/courses/${created.body.id}`)
                .set(ADMIN_AUTH_HEADER)
                .send({
                    ...VALID_BASE_COURSE,
                    seasonName: "Día de la Madre 2026"
                });

            expect(updateRes.status).toBe(200);
            expect(updateRes.body.seasonName).toBe("Día de la Madre 2026");

            const stored = fake.courses.get(created.body.id);
            expect(stored.seasonName).toBe("Día de la Madre 2026");
        });

        it("clears seasonName to null when omitted in PUT request", async () => {
            const created = await request(app)
                .post("/api/admin/courses")
                .set(ADMIN_AUTH_HEADER)
                .send({
                    ...VALID_BASE_COURSE,
                    seasonName: "Navidad 2026"
                });

            expect(created.status).toBe(201);
            expect(created.body.seasonName).toBe("Navidad 2026");

            // Omit seasonName in full PUT
            const { seasonName, ...withoutSeason } = VALID_BASE_COURSE;
            const updateRes = await request(app)
                .put(`/api/admin/courses/${created.body.id}`)
                .set(ADMIN_AUTH_HEADER)
                .send(withoutSeason);

            expect(updateRes.status).toBe(200);
            expect(updateRes.body.seasonName).toBeNull();

            const stored = fake.courses.get(created.body.id);
            expect(stored.seasonName).toBeNull();
        });

        it("clears seasonName to null when explicitly sent as null in PUT request", async () => {
            const created = await request(app)
                .post("/api/admin/courses")
                .set(ADMIN_AUTH_HEADER)
                .send({
                    ...VALID_BASE_COURSE,
                    seasonName: "Navidad 2026"
                });

            const updateRes = await request(app)
                .put(`/api/admin/courses/${created.body.id}`)
                .set(ADMIN_AUTH_HEADER)
                .send({
                    ...VALID_BASE_COURSE,
                    seasonName: null
                });

            expect(updateRes.status).toBe(200);
            expect(updateRes.body.seasonName).toBeNull();
        });
    });

    describe("GET /api/admin/courses/:id (Reading seasonal value in admin detail)", () => {
        it("returns seasonName in the administrative detail endpoint", async () => {
            const created = await request(app)
                .post("/api/admin/courses")
                .set(ADMIN_AUTH_HEADER)
                .send({
                    ...VALID_BASE_COURSE,
                    seasonName: "Verano Infantil 2026"
                });

            const detailRes = await request(app)
                .get(`/api/admin/courses/${created.body.id}`)
                .set(ADMIN_AUTH_HEADER);

            expect(detailRes.status).toBe(200);
            expect(detailRes.body.seasonName).toBe("Verano Infantil 2026");
        });

        it("returns seasonName: null in administrative detail when course is not seasonal", async () => {
            const created = await request(app)
                .post("/api/admin/courses")
                .set(ADMIN_AUTH_HEADER)
                .send(VALID_BASE_COURSE);

            const detailRes = await request(app)
                .get(`/api/admin/courses/${created.body.id}`)
                .set(ADMIN_AUTH_HEADER);

            expect(detailRes.status).toBe(200);
            expect(detailRes.body.seasonName).toBeNull();
        });
    });

    describe("Authentication and Authorization on administrative endpoints", () => {
        it("rejects unauthenticated POST with 401 and does not create course", async () => {
            const countBefore = fake.courses.size;
            const res = await request(app)
                .post("/api/admin/courses")
                .send({
                    ...VALID_BASE_COURSE,
                    seasonName: "Navidad 2026"
                });

            expect(res.status).toBe(401);
            expect(fake.courses.size).toBe(countBefore);
        });

        it("rejects non-admin POST with 403 and does not create course", async () => {
            const countBefore = fake.courses.size;
            const res = await request(app)
                .post("/api/admin/courses")
                .set(USER_AUTH_HEADER)
                .send({
                    ...VALID_BASE_COURSE,
                    seasonName: "Navidad 2026"
                });

            expect(res.status).toBe(403);
            expect(fake.courses.size).toBe(countBefore);
        });

        it("rejects unauthenticated PUT with 401 without modifying course", async () => {
            const created = await request(app)
                .post("/api/admin/courses")
                .set(ADMIN_AUTH_HEADER)
                .send({
                    ...VALID_BASE_COURSE,
                    seasonName: "Original 2026"
                });

            const res = await request(app)
                .put(`/api/admin/courses/${created.body.id}`)
                .send({
                    ...VALID_BASE_COURSE,
                    seasonName: "Hacked 2026"
                });

            expect(res.status).toBe(401);
            expect(fake.courses.get(created.body.id).seasonName).toBe("Original 2026");
        });

        it("rejects non-admin PUT with 403 without modifying course", async () => {
            const created = await request(app)
                .post("/api/admin/courses")
                .set(ADMIN_AUTH_HEADER)
                .send({
                    ...VALID_BASE_COURSE,
                    seasonName: "Original 2026"
                });

            const res = await request(app)
                .put(`/api/admin/courses/${created.body.id}`)
                .set(USER_AUTH_HEADER)
                .send({
                    ...VALID_BASE_COURSE,
                    seasonName: "Hacked 2026"
                });

            expect(res.status).toBe(403);
            expect(fake.courses.get(created.body.id).seasonName).toBe("Original 2026");
        });
    });

    describe("GET /api/courses/seasonal (Public Seasonal Catalog - HU-A08 - Rama 3)", () => {
        function seedCourse(status = COURSE_STATUS.PUBLISHED, overrides = {}) {
            const id = overrides.id ?? `course-${fake.courses.size + 1}`;
            const now = new Date(fake.timestamp());
            const course = {
                ...VALID_BASE_COURSE,
                id,
                status,
                seasonName: null,
                createdAt: { toDate: () => now },
                updatedAt: { toDate: () => now },
                ...overrides
            };
            fake.courses.set(id, course);
            return course;
        }

        afterEach(() => {
            vi.useRealTimers();
        });

        it("returns only seasonal courses that are published and not yet ended", async () => {
            const seasonalActive = seedCourse(COURSE_STATUS.PUBLISHED, {
                id: "seasonal-active-1",
                name: "Especial Galletas de Navidad",
                seasonName: "Navidad 2026",
                schedule: {
                    startDate: "2026-12-01",
                    endDate: "2026-12-24"
                }
            });

            const res = await request(app).get("/api/courses/seasonal");

            expect(res.status).toBe(200);
            expect(res.body).toHaveLength(1);
            expect(res.body[0].id).toBe(seasonalActive.id);
            expect(res.body[0].seasonName).toBe("Navidad 2026");
        });

        it("excludes draft, archived, and ended seasonal courses", async () => {
            seedCourse(COURSE_STATUS.DRAFT, {
                id: "seasonal-draft",
                seasonName: "Navidad 2026"
            });

            seedCourse(COURSE_STATUS.ARCHIVED, {
                id: "seasonal-archived",
                seasonName: "Navidad 2026"
            });

            seedCourse(COURSE_STATUS.PUBLISHED, {
                id: "seasonal-ended",
                seasonName: "Navidad 2026",
                schedule: {
                    startDate: "2026-01-01",
                    endDate: "2026-01-10"
                }
            });

            const active = seedCourse(COURSE_STATUS.PUBLISHED, {
                id: "seasonal-active",
                seasonName: "Navidad 2026",
                schedule: {
                    startDate: "2026-12-01",
                    endDate: "2026-12-24"
                }
            });

            const res = await request(app).get("/api/courses/seasonal");

            expect(res.status).toBe(200);
            expect(res.body).toHaveLength(1);
            expect(res.body[0].id).toBe(active.id);
        });

        it("shows a non-seasonal published course in /api/courses but excludes it from /api/courses/seasonal", async () => {
            const standardCourse = seedCourse(COURSE_STATUS.PUBLISHED, {
                id: "standard-course-1",
                name: "Curso Regular de Pastelería",
                seasonName: null
            });

            const seasonalCourse = seedCourse(COURSE_STATUS.PUBLISHED, {
                id: "seasonal-course-1",
                name: "Curso Especial de Navidad",
                seasonName: "Navidad 2026",
                schedule: {
                    startDate: "2026-12-01",
                    endDate: "2026-12-24"
                }
            });

            const generalRes = await request(app).get("/api/courses");
            expect(generalRes.status).toBe(200);
            const generalIds = generalRes.body.map((c) => c.id);
            expect(generalIds).toContain(standardCourse.id);
            expect(generalIds).toContain(seasonalCourse.id);

            const seasonalRes = await request(app).get("/api/courses/seasonal");
            expect(seasonalRes.status).toBe(200);
            expect(seasonalRes.body).toHaveLength(1);
            expect(seasonalRes.body[0].id).toBe(seasonalCourse.id);
            expect(seasonalRes.body.map((c) => c.id)).not.toContain(standardCourse.id);
        });

        it("orders seasonal courses by startDate ascending, resolves ties by name, and puts courses without schedule last", async () => {
            const cTie2 = seedCourse(COURSE_STATUS.PUBLISHED, {
                id: "c-tie-2",
                name: "Zumo y Masas Navideñas",
                seasonName: "Navidad 2026",
                schedule: { startDate: "2026-12-05", endDate: "2026-12-20" }
            });

            const cTie1 = seedCourse(COURSE_STATUS.PUBLISHED, {
                id: "c-tie-1",
                name: "Alfajores Navideños",
                seasonName: "Navidad 2026",
                schedule: { startDate: "2026-12-05", endDate: "2026-12-20" }
            });

            const cEarly = seedCourse(COURSE_STATUS.PUBLISHED, {
                id: "c-early",
                name: "Tronco Navideño Temprano",
                seasonName: "Navidad 2026",
                schedule: { startDate: "2026-12-01", endDate: "2026-12-10" }
            });

            const cNoSchedule = seedCourse(COURSE_STATUS.PUBLISHED, {
                id: "c-no-schedule",
                name: "Panetón Tradicional",
                seasonName: "Navidad 2026",
                schedule: null
            });

            const res = await request(app).get("/api/courses/seasonal");

            expect(res.status).toBe(200);
            const ids = res.body.map((c) => c.id);
            expect(ids).toEqual([
                cEarly.id,
                cTie1.id,
                cTie2.id,
                cNoSchedule.id
            ]);
        });

        it("returns EXACT public keys matching PublicCourse contract", async () => {
            seedCourse(COURSE_STATUS.PUBLISHED, {
                id: "seasonal-exact-keys",
                seasonName: "Especial San Valentín 2026",
                schedule: { startDate: "2026-12-01", endDate: "2026-12-15" }
            });

            const res = await request(app).get("/api/courses/seasonal");

            expect(res.status).toBe(200);
            expect(res.body).toHaveLength(1);
            const item = res.body[0];
            const expectedKeys = [
                "capacity",
                "courseType",
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
                "seasonName",
                "summary"
            ];
            expect(Object.keys(item).sort()).toEqual(expectedKeys);
            expect(item).not.toHaveProperty("status");
            expect(item).not.toHaveProperty("createdAt");
            expect(item).not.toHaveProperty("updatedAt");
            expect(item.seasonName).toBe("Especial San Valentín 2026");
        });

        it("functions without authentication and never calls verifyIdToken", async () => {
            seedCourse(COURSE_STATUS.PUBLISHED, {
                seasonName: "Verano 2026",
                schedule: { startDate: "2026-12-01", endDate: "2026-12-20" }
            });

            const res = await request(app).get("/api/courses/seasonal");

            expect(res.status).toBe(200);
            expect(fake.verifyIdToken).not.toHaveBeenCalled();
        });

        it("returns the course list and NOT a 404 error from the :id route parameter", async () => {
            const res = await request(app).get("/api/courses/seasonal");

            expect(res.status).toBe(200);
            expect(Array.isArray(res.body)).toBe(true);
            expect(res.body).not.toHaveProperty("message");
        });

        it("ensures GET /api/courses/:id continues working alongside /api/courses/seasonal", async () => {
            const course = seedCourse(COURSE_STATUS.PUBLISHED, {
                id: "pub-course-detail-check",
                seasonName: "Navidad 2026",
                schedule: { startDate: "2026-12-01", endDate: "2026-12-24" }
            });

            const detailRes = await request(app).get(`/api/courses/${course.id}`);

            expect(detailRes.status).toBe(200);
            expect(detailRes.body.id).toBe(course.id);
            expect(detailRes.body.seasonName).toBe("Navidad 2026");
        });

        it("applies time boundary rules with vi.useFakeTimers (ends yesterday -> excluded, ends today -> included)", async () => {
            vi.useFakeTimers();
            vi.setSystemTime(new Date("2026-11-20T12:00:00.000Z"));

            seedCourse(COURSE_STATUS.PUBLISHED, {
                id: "course-ended-yesterday",
                seasonName: "Navidad 2026",
                schedule: { startDate: "2026-11-10", endDate: "2026-11-19" }
            });

            const endsToday = seedCourse(COURSE_STATUS.PUBLISHED, {
                id: "course-ends-today",
                seasonName: "Navidad 2026",
                schedule: { startDate: "2026-11-10", endDate: "2026-11-20" }
            });

            const endsTomorrow = seedCourse(COURSE_STATUS.PUBLISHED, {
                id: "course-ends-tomorrow",
                seasonName: "Navidad 2026",
                schedule: { startDate: "2026-11-10", endDate: "2026-11-21" }
            });

            const res = await request(app).get("/api/courses/seasonal");

            expect(res.status).toBe(200);
            const ids = res.body.map((c) => c.id);
            expect(ids).not.toContain("course-ended-yesterday");
            expect(ids).toContain(endsToday.id);
            expect(ids).toContain(endsTomorrow.id);
        });

        it("returns clean 500 when repository throws an unexpected error", async () => {
            fake.collection.mockImplementationOnce(() => {
                throw new Error("FIRESTORE_CLUSTER_UNREACHABLE_SOCKET_TIMEOUT");
            });

            const res = await request(app).get("/api/courses/seasonal");

            expect(res.status).toBe(500);
            expect(res.body).toEqual({ message: "Could not retrieve seasonal courses." });
            expect(JSON.stringify(res.body)).not.toContain("FIRESTORE_CLUSTER_UNREACHABLE_SOCKET_TIMEOUT");
            expect(res.body.stack).toBeUndefined();
        });
    });

    describe("DELETE /api/admin/courses/:id/seasonal (Seasonal Publication Withdrawal - HU-A08 - Rama 4)", () => {
        function seedCourse(status = COURSE_STATUS.PUBLISHED, overrides = {}) {
            const id = overrides.id ?? `course-${fake.courses.size + 1}`;
            const now = new Date(fake.timestamp());
            const course = {
                ...VALID_BASE_COURSE,
                id,
                status,
                seasonName: null,
                createdAt: { toDate: () => now },
                updatedAt: { toDate: () => now },
                ...overrides
            };
            fake.courses.set(id, course);
            return course;
        }

        it("returns 204 and clears seasonName to null while preserving all other fields and status", async () => {
            const course = seedCourse(COURSE_STATUS.PUBLISHED, {
                id: "course-withdraw-1",
                name: "Curso de Galletas Festivas",
                seasonName: "Navidad 2026",
                capacity: 10,
                price: 40000
            });

            const res = await request(app)
                .delete(`/api/admin/courses/${course.id}/seasonal`)
                .set(ADMIN_AUTH_HEADER);

            expect(res.status).toBe(204);
            expect(res.body).toEqual({});

            const updated = fake.courses.get(course.id);
            expect(updated.seasonName).toBeNull();
            expect(updated.name).toBe("Curso de Galletas Festivas");
            expect(updated.status).toBe(COURSE_STATUS.PUBLISHED);
            expect(updated.capacity).toBe(10);
            expect(updated.price).toBe(40000);
            expect(updated.description).toBe(course.description);
            expect(updated.learningOutcomes).toEqual(course.learningOutcomes);
            expect(updated.schedule).toEqual(course.schedule);
        });

        it("causes course to disappear from /api/courses/seasonal while remaining in /api/courses", async () => {
            const course = seedCourse(COURSE_STATUS.PUBLISHED, {
                id: "course-withdraw-visibility",
                seasonName: "Pascua 2026",
                schedule: { startDate: "2026-12-01", endDate: "2026-12-15" }
            });

            // Initially visible in both
            const beforeSeasonal = await request(app).get("/api/courses/seasonal");
            expect(beforeSeasonal.body.map((c) => c.id)).toContain(course.id);
            const beforeGeneral = await request(app).get("/api/courses");
            expect(beforeGeneral.body.map((c) => c.id)).toContain(course.id);

            // Withdraw seasonal publication
            const res = await request(app)
                .delete(`/api/admin/courses/${course.id}/seasonal`)
                .set(ADMIN_AUTH_HEADER);
            expect(res.status).toBe(204);

            // Now excluded from seasonal
            const afterSeasonal = await request(app).get("/api/courses/seasonal");
            expect(afterSeasonal.body.map((c) => c.id)).not.toContain(course.id);

            // Still included in general catalog
            const afterGeneral = await request(app).get("/api/courses");
            expect(afterGeneral.body.map((c) => c.id)).toContain(course.id);
            const generalItem = afterGeneral.body.find((c) => c.id === course.id);
            expect(generalItem.seasonName).toBeNull();
        });

        it("ensures other courses in the database remain completely untouched", async () => {
            const targetCourse = seedCourse(COURSE_STATUS.PUBLISHED, {
                id: "target-course",
                seasonName: "Navidad 2026"
            });
            const otherCourse1 = seedCourse(COURSE_STATUS.PUBLISHED, {
                id: "other-course-1",
                name: "Otro Curso Navideño",
                seasonName: "Navidad 2026"
            });
            const otherCourse2 = seedCourse(COURSE_STATUS.DRAFT, {
                id: "other-course-2",
                name: "Curso Regular Borrador",
                seasonName: null
            });

            const beforeOther1 = { ...fake.courses.get(otherCourse1.id) };
            const beforeOther2 = { ...fake.courses.get(otherCourse2.id) };

            const res = await request(app)
                .delete(`/api/admin/courses/${targetCourse.id}/seasonal`)
                .set(ADMIN_AUTH_HEADER);
            expect(res.status).toBe(204);

            expect(fake.courses.get(otherCourse1.id)).toEqual(beforeOther1);
            expect(fake.courses.get(otherCourse2.id)).toEqual(beforeOther2);
        });

        it("is idempotent: withdrawing twice returns 204 on both attempts", async () => {
            const course = seedCourse(COURSE_STATUS.PUBLISHED, {
                id: "idempotent-withdraw",
                seasonName: "Navidad 2026"
            });

            const first = await request(app)
                .delete(`/api/admin/courses/${course.id}/seasonal`)
                .set(ADMIN_AUTH_HEADER);
            expect(first.status).toBe(204);

            const second = await request(app)
                .delete(`/api/admin/courses/${course.id}/seasonal`)
                .set(ADMIN_AUTH_HEADER);
            expect(second.status).toBe(204);

            expect(fake.courses.get(course.id).seasonName).toBeNull();
        });

        it("returns 404 Course not found when course does not exist", async () => {
            const res = await request(app)
                .delete("/api/admin/courses/non-existent-course-id/seasonal")
                .set(ADMIN_AUTH_HEADER);

            expect(res.status).toBe(404);
            expect(res.body).toEqual({ message: "Course not found." });
        });

        it("rejects unauthenticated request with 401 without modifying course", async () => {
            const course = seedCourse(COURSE_STATUS.PUBLISHED, {
                id: "unauth-withdraw",
                seasonName: "Navidad 2026"
            });

            const res = await request(app)
                .delete(`/api/admin/courses/${course.id}/seasonal`);

            expect(res.status).toBe(401);
            expect(fake.courses.get(course.id).seasonName).toBe("Navidad 2026");
        });

        it("rejects non-admin request with 403 without modifying course", async () => {
            const course = seedCourse(COURSE_STATUS.PUBLISHED, {
                id: "non-admin-withdraw",
                seasonName: "Navidad 2026"
            });

            const res = await request(app)
                .delete(`/api/admin/courses/${course.id}/seasonal`)
                .set(USER_AUTH_HEADER);

            expect(res.status).toBe(403);
            expect(fake.courses.get(course.id).seasonName).toBe("Navidad 2026");
        });

        it("allows re-marking the course as seasonal with PUT after withdrawal", async () => {
            const course = seedCourse(COURSE_STATUS.PUBLISHED, {
                id: "remark-after-withdraw",
                seasonName: "Navidad 2026"
            });

            // Withdraw
            const withdrawRes = await request(app)
                .delete(`/api/admin/courses/${course.id}/seasonal`)
                .set(ADMIN_AUTH_HEADER);
            expect(withdrawRes.status).toBe(204);
            expect(fake.courses.get(course.id).seasonName).toBeNull();

            // Re-mark via PUT
            const remarkRes = await request(app)
                .put(`/api/admin/courses/${course.id}`)
                .set(ADMIN_AUTH_HEADER)
                .send({
                    ...VALID_BASE_COURSE,
                    seasonName: "Especial San Valentín 2027"
                });

            expect(remarkRes.status).toBe(200);
            expect(remarkRes.body.seasonName).toBe("Especial San Valentín 2027");
            expect(fake.courses.get(course.id).seasonName).toBe("Especial San Valentín 2027");
        });

        it("returns clean 500 when repository fails unexpectedly on withdrawal", async () => {
            const course = seedCourse(COURSE_STATUS.PUBLISHED, {
                id: "fault-withdraw-500",
                seasonName: "Navidad 2026"
            });

            fake.collection.mockImplementationOnce(() => {
                throw new Error("UNEXPECTED_TRANSACTION_FAILURE");
            });

            const res = await request(app)
                .delete(`/api/admin/courses/${course.id}/seasonal`)
                .set(ADMIN_AUTH_HEADER);

            expect(res.status).toBe(500);
            expect(res.body).toEqual({ message: "Could not withdraw seasonal publication." });
            expect(JSON.stringify(res.body)).not.toContain("UNEXPECTED_TRANSACTION_FAILURE");
            expect(res.body.stack).toBeUndefined();
        });
    });
});
