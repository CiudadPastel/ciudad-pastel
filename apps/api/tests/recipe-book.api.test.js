import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

const fake = vi.hoisted(() => {
    const courses = new Map();
    const recipeBooks = new Map();
    const storageFiles = new Map();
    let failCreateRepo = false;

    return {
        courses,
        recipeBooks,
        storageFiles,
        flags: { failCreateRepo },
        verifyIdToken: vi.fn(),
        courseRepository: {
            getCourseById: vi.fn((id) => Promise.resolve(courses.get(id) || null))
        },
        recipeBookRepository: {
            createRecipeBook: vi.fn((recipeBook) => {
                if (fake.flags.failCreateRepo) {
                    return Promise.reject(new Error("Firestore metadata write failed"));
                }
                const saved = {
                    ...recipeBook,
                    createdAt: "2026-10-16T12:00:00.000Z",
                    updatedAt: "2026-10-16T12:00:00.000Z"
                };
                recipeBooks.set(saved.id, saved);
                const { createdBy, ...publicShape } = saved;
                return Promise.resolve(publicShape);
            }),
            getRecipeBookById: vi.fn((id) => Promise.resolve(recipeBooks.get(id) || null)),
            getRecipeBooksByCourseId: vi.fn((courseId) => {
                const list = Array.from(recipeBooks.values())
                    .filter((rb) => rb.courseId === courseId)
                    .map(({ createdBy, ...publicShape }) => publicShape);
                return Promise.resolve(list);
            }),
            countRecipeBooksByCourseId: vi.fn((courseId) => {
                const count = Array.from(recipeBooks.values()).filter((rb) => rb.courseId === courseId).length;
                return Promise.resolve(count);
            }),
            deleteRecipeBook: vi.fn((id) => {
                const deleted = recipeBooks.delete(id);
                return Promise.resolve(deleted);
            })
        },
        recipeBookStorage: {
            saveRecipeBookFile: vi.fn((id, buffer) => {
                storageFiles.set(id, buffer);
                return Promise.resolve();
            }),
            readRecipeBookFile: vi.fn((id) => Promise.resolve(storageFiles.get(id) || null)),
            deleteRecipeBookFile: vi.fn((id) => {
                storageFiles.delete(id);
                return Promise.resolve();
            })
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
vi.mock("../src/repositories/recipe-book.repository.js", () => fake.recipeBookRepository);
vi.mock("../src/storage/recipe-book.storage.js", () => fake.recipeBookStorage);

import app from "../src/app.js";
import { RECIPE_BOOK_LIMITS } from "../src/validators/recipe-book.validator.js";

const VALID_PDF_BUFFER = Buffer.from("%PDF-1.4 sample content for recipe book");
const COURSE_ID = "course-abc-123";

function seedCourse(status = "published", id = COURSE_ID) {
    const course = {
        id,
        name: "Curso de Repostería Básica",
        status,
        createdAt: "2026-10-01T10:00:00.000Z",
        updatedAt: "2026-10-01T10:00:00.000Z"
    };
    fake.courses.set(id, course);
    return course;
}

function adminRequest(method, url) {
    fake.verifyIdToken.mockResolvedValue({
        uid: "admin-uid-123",
        email: "admin@ciudadpastel.com",
        admin: true
    });
    return request(app)[method](url).set("Authorization", "Bearer valid-admin-token");
}

describe("POST /api/admin/courses/:courseId/recipe-books", () => {
    beforeEach(() => {
        fake.courses.clear();
        fake.recipeBooks.clear();
        fake.storageFiles.clear();
        fake.flags.failCreateRepo = false;
        vi.clearAllMocks();
        seedCourse();
    });

    it("uploads a valid PDF and returns 201 with public RecipeBook shape without createdBy", async () => {
        const response = await adminRequest("post", `/api/admin/courses/${COURSE_ID}/recipe-books`)
            .attach("file", VALID_PDF_BUFFER, { filename: "recetario_pasteles.pdf", contentType: "application/pdf" })
            .field("title", "Recetario Oficial de Pasteles");

        expect(response.status).toBe(201);
        expect(response.body).toMatchObject({
            courseId: COURSE_ID,
            title: "Recetario Oficial de Pasteles",
            fileName: "recetario_pasteles.pdf",
            contentType: "application/pdf",
            sizeBytes: VALID_PDF_BUFFER.length
        });
        expect(response.body).toHaveProperty("id");
        expect(response.body).toHaveProperty("createdAt");
        expect(response.body).toHaveProperty("updatedAt");
        expect(response.body).not.toHaveProperty("createdBy");

        expect(fake.recipeBookStorage.saveRecipeBookFile).toHaveBeenCalled();
        expect(fake.recipeBookRepository.createRecipeBook).toHaveBeenCalled();
    });

    it("defaults title to file name without .pdf when title is omitted", async () => {
        const response = await adminRequest("post", `/api/admin/courses/${COURSE_ID}/recipe-books`)
            .attach("file", VALID_PDF_BUFFER, { filename: "Panaderia_Dulce.pdf", contentType: "application/pdf" });

        expect(response.status).toBe(201);
        expect(response.body.title).toBe("Panaderia_Dulce");
    });

    it("handles file names with accents encoded in latin1 by Multer", async () => {
        const response = await adminRequest("post", `/api/admin/courses/${COURSE_ID}/recipe-books`)
            .attach("file", VALID_PDF_BUFFER, { filename: "Recetario_Básico.pdf", contentType: "application/pdf" });

        expect(response.status).toBe(201);
        expect(response.body.fileName).toBe("Recetario_Básico.pdf");
    });

    it("rejects non-PDF MIME type with 400", async () => {
        const response = await adminRequest("post", `/api/admin/courses/${COURSE_ID}/recipe-books`)
            .attach("file", Buffer.from("image bytes"), { filename: "foto.png", contentType: "image/png" });

        expect(response.status).toBe(400);
        expect(response.body.message).toMatch(/validation/i);
        expect(response.body.errors).toEqual(expect.arrayContaining([expect.stringContaining("PDF")]));
    });

    it("rejects fake PDF signature with 400", async () => {
        const response = await adminRequest("post", `/api/admin/courses/${COURSE_ID}/recipe-books`)
            .attach("file", Buffer.from("NOTPDF content"), { filename: "fake.pdf", contentType: "application/pdf" });

        expect(response.status).toBe(400);
        expect(response.body.errors).toEqual(expect.arrayContaining([expect.stringContaining("valid PDF")]));
    });

    it("rejects empty file with 400", async () => {
        const response = await adminRequest("post", `/api/admin/courses/${COURSE_ID}/recipe-books`)
            .attach("file", Buffer.alloc(0), { filename: "empty.pdf", contentType: "application/pdf" });

        expect(response.status).toBe(400);
        expect(response.body.errors).toEqual(expect.arrayContaining([expect.stringContaining("empty")]));
    });

    it("rejects missing file with 400", async () => {
        const response = await adminRequest("post", `/api/admin/courses/${COURSE_ID}/recipe-books`)
            .field("title", "Only a title");

        expect(response.status).toBe(400);
        expect(response.body.errors).toEqual(expect.arrayContaining([expect.stringContaining("file is required")]));
    });

    it("rejects file exceeding max size with 413", async () => {
        const oversized = Buffer.alloc(RECIPE_BOOK_LIMITS.maxBytes + 1024);
        oversized.write("%PDF-", 0);

        const response = await adminRequest("post", `/api/admin/courses/${COURSE_ID}/recipe-books`)
            .attach("file", oversized, { filename: "huge.pdf", contentType: "application/pdf" });

        expect(response.status).toBe(413);
        expect(response.body.message).toMatch(/too large/i);
    });

    it("returns 404 if course does not exist", async () => {
        const response = await adminRequest("post", "/api/admin/courses/nonexistent-course/recipe-books")
            .attach("file", VALID_PDF_BUFFER, { filename: "recetario.pdf", contentType: "application/pdf" });

        expect(response.status).toBe(404);
        expect(response.body.message).toBe("Course not found.");
    });

    it.each(["draft", "archived"])("accepts uploading recipe books to %s courses", async (status) => {
        const courseId = `course-${status}`;
        seedCourse(status, courseId);

        const response = await adminRequest("post", `/api/admin/courses/${courseId}/recipe-books`)
            .attach("file", VALID_PDF_BUFFER, { filename: "recetario.pdf", contentType: "application/pdf" });

        expect(response.status).toBe(201);
    });

    it("rejects with 409 when course already reached 10 recipe books", async () => {
        fake.recipeBookRepository.countRecipeBooksByCourseId.mockResolvedValueOnce(10);

        const response = await adminRequest("post", `/api/admin/courses/${COURSE_ID}/recipe-books`)
            .attach("file", VALID_PDF_BUFFER, { filename: "recetario11.pdf", contentType: "application/pdf" });

        expect(response.status).toBe(409);
        expect(response.body.message).toMatch(/maximum/i);
    });

    it("requires authentication returning 401 without token", async () => {
        const response = await request(app)
            .post(`/api/admin/courses/${COURSE_ID}/recipe-books`)
            .attach("file", VALID_PDF_BUFFER, { filename: "recetario.pdf", contentType: "application/pdf" });

        expect(response.status).toBe(401);
    });

    it("rejects non-admin users with 403 and never invokes storage layer", async () => {
        fake.verifyIdToken.mockResolvedValue({
            uid: "regular-user",
            admin: false
        });

        const response = await request(app)
            .post(`/api/admin/courses/${COURSE_ID}/recipe-books`)
            .set("Authorization", "Bearer regular-token")
            .attach("file", VALID_PDF_BUFFER, { filename: "recetario.pdf", contentType: "application/pdf" });

        expect(response.status).toBe(403);
        expect(fake.recipeBookStorage.saveRecipeBookFile).not.toHaveBeenCalled();
    });

    it("cleans up storage file if metadata persistence fails", async () => {
        fake.flags.failCreateRepo = true;

        const response = await adminRequest("post", `/api/admin/courses/${COURSE_ID}/recipe-books`)
            .attach("file", VALID_PDF_BUFFER, { filename: "recetario.pdf", contentType: "application/pdf" });

        expect(response.status).toBe(500);
        expect(fake.recipeBookStorage.deleteRecipeBookFile).toHaveBeenCalled();
    });
});
