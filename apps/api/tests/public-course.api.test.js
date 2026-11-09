import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

const fake = vi.hoisted(() => {
    const courses = new Map();

    return {
        courses,
        verifyIdToken: vi.fn(),
        repository: {
            getCourses: vi.fn((status) => {
                const list = Array.from(courses.values());
                if (status) {
                    return Promise.resolve(list.filter((c) => c.status === status));
                }
                return Promise.resolve(list);
            }),
            getCourseById: vi.fn((id) => Promise.resolve(courses.get(id) || null))
        }
    };
});

// Avoid loading credentials or touching real Firebase
vi.mock("dotenv", () => ({ default: { config: vi.fn() } }));
vi.mock("firebase-admin/app", () => {
    throw new Error("Real Firebase app access is forbidden.");
});
vi.mock("../src/config/firebase.js", () => ({
    auth: { verifyIdToken: fake.verifyIdToken },
    db: { collection: vi.fn() }
}));
vi.mock("../src/repositories/course.repository.js", () => fake.repository);
// HU-A09: no confirmed enrollments in these tests (all spots free)
vi.mock("../src/repositories/enrollment.repository.js", () => ({
    countActiveEnrollmentsByCourse: async () => new Map()
}));

import app from "../src/app.js";
import { COURSE_STATUS, toPublicCourse } from "../src/models/course.model.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const openApiPath = path.join(__dirname, "../docs/openapi.yaml");

const sampleSchedule = {
    startDate: "2026-11-10",
    endDate: "2026-11-24",
    startTime: "18:00",
    endTime: "21:00",
    frequency: "weekly",
    weekday: "tuesday",
    scheduleNote: "Traer delantal"
};

function seedCourse(status = COURSE_STATUS.PUBLISHED, id = "sample-course") {
    const course = {
        id,
        name: "Curso de Galletas Decoradas",
        summary: "Aprende glaseado y técnicas avanzadas de decoración.",
        description: "Taller 100% práctico con ingredientes incluidos para principiantes.",
        imageUrl: "https://example.com/galletas.jpg",
        learningOutcomes: ["Técnica de glasé fluido", "Uso de boquillas finas"],
        requiredMaterials: ["Caja para transportar galletas"],
        capacity: 8,
        price: 35000,
        instructor: "Yamilena Blanco Chaves",
        schedule: { ...sampleSchedule },
        courseType: "workshop",
        whatYouWillLearn: "Decoración profesional de galletas.",
        location: "Ciudad Pastel — Florencia",
        address: "100 m norte de la escuela",
        materialsNote: "Materiales incluidos",
        prerequisites: null,
        reservationAmount: 10000,
        priceNote: "Incluye ingredientes",
        status,
        createdAt: "2026-10-01T10:00:00.000Z",
        updatedAt: "2026-10-01T10:00:00.000Z"
    };

    fake.courses.set(id, course);
    return course;
}

describe("Public Courses API Acceptance Criteria Suite [CIU-74 / CIU-80]", () => {
    beforeEach(() => {
        fake.courses.clear();
        vi.clearAllMocks();
    });

    describe("GET /api/courses (Public Catalog)", () => {
        it("returns empty array when 0 courses are published", async () => {
            const response = await request(app).get("/api/courses");

            expect(response.status).toBe(200);
            expect(response.body).toEqual([]);
            expect(fake.verifyIdToken).not.toHaveBeenCalled();
        });

        it("returns single course when 1 course is published", async () => {
            const course = seedCourse(COURSE_STATUS.PUBLISHED, "single-course");
            const response = await request(app).get("/api/courses");

            expect(response.status).toBe(200);
            expect(response.body).toHaveLength(1);
            expect(response.body[0]).toEqual(toPublicCourse(course));
            expect(fake.verifyIdToken).not.toHaveBeenCalled();
        });

        it("filters out draft and archived courses in a mixed catalog", async () => {
            seedCourse(COURSE_STATUS.DRAFT, "draft-1");
            const pub1 = seedCourse(COURSE_STATUS.PUBLISHED, "pub-1");
            seedCourse(COURSE_STATUS.ARCHIVED, "arch-1");
            const pub2 = seedCourse(COURSE_STATUS.PUBLISHED, "pub-2");
            pub2.name = "Z Pastelería";
            seedCourse(COURSE_STATUS.DRAFT, "draft-2");

            const response = await request(app).get("/api/courses");

            expect(response.status).toBe(200);
            expect(response.body).toHaveLength(2);
            const ids = response.body.map((c) => c.id);
            expect(ids).toContain("pub-1");
            expect(ids).toContain("pub-2");
            expect(ids).not.toContain("draft-1");
            expect(ids).not.toContain("arch-1");
            expect(ids).not.toContain("draft-2");
        });

        it("returns EXACT public keys without internal or administrative fields", async () => {
            seedCourse(COURSE_STATUS.PUBLISHED, "exact-keys-test");

            const response = await request(app).get("/api/courses");

            expect(response.status).toBe(200);
            const item = response.body[0];
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
            expect(item.courseType).toBe("workshop");
            expect(item).not.toHaveProperty("whatYouWillLearn");
            expect(item).not.toHaveProperty("location");
            expect(item).not.toHaveProperty("address");
            expect(item).not.toHaveProperty("reservationAmount");
            expect(item).not.toHaveProperty("priceNote");
        });

        it("sorts by startDate ascending, resolves ties by name, and puts courses without schedule last", async () => {
            const c1 = seedCourse(COURSE_STATUS.PUBLISHED, "c1");
            c1.name = "B Pasteles";
            c1.schedule.startDate = "2026-12-01";

            const c2 = seedCourse(COURSE_STATUS.PUBLISHED, "c2");
            c2.name = "Z Galletas Mismo Dia";
            c2.schedule.startDate = "2026-11-01";

            const c3 = seedCourse(COURSE_STATUS.PUBLISHED, "c3");
            c3.name = "A Cupcakes Mismo Dia";
            c3.schedule.startDate = "2026-11-01";

            const c4 = seedCourse(COURSE_STATUS.PUBLISHED, "c4");
            c4.name = "Taller Antiguo Sin Horario";
            c4.schedule = null;

            const c5 = seedCourse(COURSE_STATUS.PUBLISHED, "c5");
            c5.name = "Postres Noviembre 15";
            c5.schedule.startDate = "2026-11-15";

            const response = await request(app).get("/api/courses");

            expect(response.status).toBe(200);
            expect(response.body.map((c) => c.name)).toEqual([
                "A Cupcakes Mismo Dia",
                "Z Galletas Mismo Dia",
                "Postres Noviembre 15",
                "B Pasteles",
                "Taller Antiguo Sin Horario"
            ]);
        });

        it.each(["draft", "archived", "unknown"])(
            "ignores ?status=%s query parameter and never leaks drafts or archived courses",
            async (statusQuery) => {
                seedCourse(COURSE_STATUS.DRAFT, "hidden-draft");
                seedCourse(COURSE_STATUS.ARCHIVED, "hidden-archived");
                const pub = seedCourse(COURSE_STATUS.PUBLISHED, "visible-published");

                const response = await request(app).get(`/api/courses?status=${statusQuery}`);

                expect(response.status).toBe(200);
                expect(response.body).toEqual([toPublicCourse(pub)]);
            }
        );

        it("returns 500 without leaking internal details when repository fails", async () => {
            fake.repository.getCourses.mockRejectedValueOnce(
                new Error("Firestore cluster replica deadlock on node 12")
            );

            const response = await request(app).get("/api/courses");

            expect(response.status).toBe(500);
            expect(response.body).toEqual({ message: "Could not retrieve courses." });
            expect(JSON.stringify(response.body)).not.toContain("replica deadlock");
            expect(JSON.stringify(response.body)).not.toContain("node 12");
        });
    });

    describe("GET /api/courses/:id (Public Course Detail)", () => {
        it("returns 200 with toPublicCourse representation for a published course", async () => {
            const course = seedCourse(COURSE_STATUS.PUBLISHED, "pub-detail");

            const response = await request(app).get(`/api/courses/${course.id}`);

            expect(response.status).toBe(200);
            expect(response.body).toEqual(toPublicCourse(course));
            expect(fake.verifyIdToken).not.toHaveBeenCalled();
            expect(response.body).not.toHaveProperty("status");
            expect(response.body).not.toHaveProperty("createdAt");
            expect(response.body).not.toHaveProperty("updatedAt");
        });

        it.each([
            ["draft", COURSE_STATUS.DRAFT],
            ["archived", COURSE_STATUS.ARCHIVED]
        ])("returns 404 Course not found for a %s course without revealing existence", async (_label, status) => {
            const course = seedCourse(status, `course-${status}`);

            const response = await request(app).get(`/api/courses/${course.id}`);

            expect(response.status).toBe(404);
            expect(response.body).toEqual({ message: "Course not found." });
            expect(fake.verifyIdToken).not.toHaveBeenCalled();
        });

        it("returns identical 404 Course not found when id does not exist", async () => {
            const response = await request(app).get("/api/courses/nonexistent-uuid");

            expect(response.status).toBe(404);
            expect(response.body).toEqual({ message: "Course not found." });
        });

        it.each([
            "../etc/passwd",
            "%20%2F%3F",
            "malicious'--",
            "invalid!@#$%"
        ])("handles strange or malicious ID %s safely with 404 without 500 error", async (specialId) => {
            const response = await request(app).get(`/api/courses/${specialId}`);

            expect([404, 400]).toContain(response.status);
            expect(response.status).not.toBe(500);
        });

        it("returns 500 without leaking internal details when repository fails on detail lookup", async () => {
            fake.repository.getCourseById.mockRejectedValueOnce(
                new Error("Firestore index corrupted in shard 3")
            );

            const response = await request(app).get("/api/courses/any-id");

            expect(response.status).toBe(500);
            expect(response.body).toEqual({ message: "Could not retrieve course." });
            expect(JSON.stringify(response.body)).not.toContain("shard 3");
            expect(JSON.stringify(response.body)).not.toContain("corrupted");
        });
    });

    describe("Lifecycle transitions: unpublishing and archiving immediate reflection", () => {
        it("immediately hides a published course from list and detail when its status changes", async () => {
            const course = seedCourse(COURSE_STATUS.PUBLISHED, "lifecycle-course");

            // Initially visible in both endpoints
            const initialList = await request(app).get("/api/courses");
            expect(initialList.status).toBe(200);
            expect(initialList.body.map((c) => c.id)).toContain(course.id);

            const initialDetail = await request(app).get(`/api/courses/${course.id}`);
            expect(initialDetail.status).toBe(200);

            // Admin unpublishes course to draft
            course.status = COURSE_STATUS.DRAFT;

            const draftList = await request(app).get("/api/courses");
            expect(draftList.status).toBe(200);
            expect(draftList.body.map((c) => c.id)).not.toContain(course.id);

            const draftDetail = await request(app).get(`/api/courses/${course.id}`);
            expect(draftDetail.status).toBe(404);
            expect(draftDetail.body).toEqual({ message: "Course not found." });

            // Admin archives course
            course.status = COURSE_STATUS.ARCHIVED;

            const archivedList = await request(app).get("/api/courses");
            expect(archivedList.status).toBe(200);
            expect(archivedList.body.map((c) => c.id)).not.toContain(course.id);

            const archivedDetail = await request(app).get(`/api/courses/${course.id}`);
            expect(archivedDetail.status).toBe(404);
            expect(archivedDetail.body).toEqual({ message: "Course not found." });
        });
    });

    describe("Security: Administrative endpoints remain protected with 401 without token", () => {
        it.each([
            ["GET", "/api/admin/courses"],
            ["POST", "/api/admin/courses"],
            ["GET", "/api/admin/courses/some-course-id"],
            ["PUT", "/api/admin/courses/some-course-id"],
            ["PATCH", "/api/admin/courses/some-course-id/status"]
        ])("rejects unauthenticated request to %s %s with 401", async (method, path) => {
            const response = await request(app)[method.toLowerCase()](path);

            expect(response.status).toBe(401);
            expect(response.body).toHaveProperty("message");
        });
    });

    describe("OpenAPI schema conformity", () => {
        it("matches PublicCourse schema in openapi.yaml exactly", async () => {
            const rawYaml = fs.readFileSync(openApiPath, "utf8");
            const spec = YAML.parse(rawYaml);
            const publicCourseSchema = spec.components?.schemas?.PublicCourse;

            expect(publicCourseSchema).toBeDefined();
            expect(publicCourseSchema.type).toBe("object");

            const expectedProperties = Object.keys(publicCourseSchema.properties).sort();
            const requiredProperties = publicCourseSchema.required || [];

            const course = seedCourse(COURSE_STATUS.PUBLISHED, "openapi-course-test");
            const response = await request(app).get(`/api/courses/${course.id}`);

            expect(response.status).toBe(200);
            const actualKeys = Object.keys(response.body).sort();

            expect(actualKeys).toEqual(expectedProperties);

            for (const requiredProp of requiredProperties) {
                expect(response.body).toHaveProperty(requiredProp);
            }

            expect(typeof response.body.id).toBe("string");
            expect(typeof response.body.name).toBe("string");
            expect(typeof response.body.summary).toBe("string");
            expect(typeof response.body.description).toBe("string");
            expect(typeof response.body.imageUrl).toBe("string");
            expect(Array.isArray(response.body.learningOutcomes)).toBe(true);
            expect(Array.isArray(response.body.requiredMaterials)).toBe(true);
            expect(typeof response.body.capacity).toBe("number");
            expect(typeof response.body.price).toBe("number");
            expect(typeof response.body.instructor).toBe("string");
            expect(typeof response.body.schedule).toBe("object");
        });
    });
});
