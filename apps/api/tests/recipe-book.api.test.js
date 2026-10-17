import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
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
                    .map(({ createdBy, ...publicShape }) => publicShape)
                    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
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

describe("GET /api/admin/courses/:courseId/recipe-books", () => {
    beforeEach(() => {
        fake.courses.clear();
        fake.recipeBooks.clear();
        fake.storageFiles.clear();
        vi.clearAllMocks();
        seedCourse();
    });

    it("returns empty array when course has no recipe books", async () => {
        const response = await adminRequest("get", `/api/admin/courses/${COURSE_ID}/recipe-books`);

        expect(response.status).toBe(200);
        expect(response.body).toEqual([]);
    });

    it("returns list of recipe books ordered newest first without createdBy", async () => {
        const book1 = {
            id: "book-1",
            courseId: COURSE_ID,
            title: "Primer recetario",
            fileName: "primer.pdf",
            contentType: "application/pdf",
            sizeBytes: 1024,
            createdBy: "admin-uid",
            createdAt: "2026-10-01T10:00:00.000Z",
            updatedAt: "2026-10-01T10:00:00.000Z"
        };
        const book2 = {
            id: "book-2",
            courseId: COURSE_ID,
            title: "Segundo recetario más reciente",
            fileName: "segundo.pdf",
            contentType: "application/pdf",
            sizeBytes: 2048,
            createdBy: "admin-uid",
            createdAt: "2026-10-15T12:00:00.000Z",
            updatedAt: "2026-10-15T12:00:00.000Z"
        };

        fake.recipeBooks.set(book1.id, book1);
        fake.recipeBooks.set(book2.id, book2);

        const response = await adminRequest("get", `/api/admin/courses/${COURSE_ID}/recipe-books`);

        expect(response.status).toBe(200);
        expect(response.body).toHaveLength(2);
        expect(response.body[0].id).toBe("book-2");
        expect(response.body[1].id).toBe("book-1");
        expect(response.body[0]).not.toHaveProperty("createdBy");
    });

    it("returns 404 if course does not exist", async () => {
        const response = await adminRequest("get", "/api/admin/courses/nonexistent-course/recipe-books");

        expect(response.status).toBe(404);
        expect(response.body.message).toBe("Course not found.");
    });

    it("returns 401 without token", async () => {
        const response = await request(app).get(`/api/admin/courses/${COURSE_ID}/recipe-books`);
        expect(response.status).toBe(401);
    });

    it("returns 403 for non-admin user", async () => {
        fake.verifyIdToken.mockResolvedValue({ uid: "user-1", admin: false });
        const response = await request(app)
            .get(`/api/admin/courses/${COURSE_ID}/recipe-books`)
            .set("Authorization", "Bearer regular-token");

        expect(response.status).toBe(403);
    });
});

describe("GET /api/admin/courses/:courseId/recipe-books/:recipeBookId/file", () => {
    const RECIPE_BOOK_ID = "book-download-1";
    const PDF_BYTES = Buffer.from("%PDF-1.4 sample file for download test");

    beforeEach(() => {
        fake.courses.clear();
        fake.recipeBooks.clear();
        fake.storageFiles.clear();
        vi.clearAllMocks();
        seedCourse();

        const book = {
            id: RECIPE_BOOK_ID,
            courseId: COURSE_ID,
            title: "Recetario de Postres",
            fileName: "Recetario_Básico.pdf",
            contentType: "application/pdf",
            sizeBytes: PDF_BYTES.length,
            createdBy: "admin-uid",
            createdAt: "2026-10-01T10:00:00.000Z",
            updatedAt: "2026-10-01T10:00:00.000Z"
        };
        fake.recipeBooks.set(RECIPE_BOOK_ID, book);
        fake.storageFiles.set(RECIPE_BOOK_ID, PDF_BYTES);
    });

    it("streams PDF with correct headers and identical binary content", async () => {
        const response = await adminRequest(
            "get",
            `/api/admin/courses/${COURSE_ID}/recipe-books/${RECIPE_BOOK_ID}/file`
        );

        expect(response.status).toBe(200);
        expect(response.header["content-type"]).toBe("application/pdf");
        expect(response.header["content-length"]).toBe(String(PDF_BYTES.length));
        expect(response.header["cache-control"]).toBe("private, no-store");
        expect(response.header["content-disposition"]).toContain("attachment;");
        expect(response.header["content-disposition"]).toContain("filename*=UTF-8''");
        expect(Buffer.compare(response.body, PDF_BYTES)).toBe(0);
    });

    it("returns 404 when recipe book belongs to a different course", async () => {
        seedCourse("published", "other-course");

        const response = await adminRequest(
            "get",
            `/api/admin/courses/other-course/recipe-books/${RECIPE_BOOK_ID}/file`
        );

        expect(response.status).toBe(404);
        expect(response.body.message).toBe("Recipe book not found.");
    });

    it("returns 404 when recipe book id does not exist", async () => {
        const response = await adminRequest(
            "get",
            `/api/admin/courses/${COURSE_ID}/recipe-books/nonexistent-book/file`
        );

        expect(response.status).toBe(404);
        expect(response.body.message).toBe("Recipe book not found.");
    });

    it("returns 404 if course does not exist", async () => {
        const response = await adminRequest(
            "get",
            `/api/admin/courses/nonexistent-course/recipe-books/${RECIPE_BOOK_ID}/file`
        );

        expect(response.status).toBe(404);
        expect(response.body.message).toBe("Course not found.");
    });

    it("returns 404 when binary file is missing from storage", async () => {
        fake.storageFiles.delete(RECIPE_BOOK_ID);

        const response = await adminRequest(
            "get",
            `/api/admin/courses/${COURSE_ID}/recipe-books/${RECIPE_BOOK_ID}/file`
        );

        expect(response.status).toBe(404);
        expect(response.body.message).toBe("Recipe book file not found.");
    });

    it("returns 401 without token", async () => {
        const response = await request(app).get(
            `/api/admin/courses/${COURSE_ID}/recipe-books/${RECIPE_BOOK_ID}/file`
        );
        expect(response.status).toBe(401);
    });

    it("returns 403 for non-admin user", async () => {
        fake.verifyIdToken.mockResolvedValue({ uid: "user-1", admin: false });
        const response = await request(app)
            .get(`/api/admin/courses/${COURSE_ID}/recipe-books/${RECIPE_BOOK_ID}/file`)
            .set("Authorization", "Bearer regular-token");

        expect(response.status).toBe(403);
    });
});

describe("DELETE /api/admin/courses/:courseId/recipe-books/:recipeBookId", () => {
    const RECIPE_BOOK_ID = "book-delete-1";
    const PDF_BYTES = Buffer.from("%PDF-1.4 file to delete");

    beforeEach(() => {
        fake.courses.clear();
        fake.recipeBooks.clear();
        fake.storageFiles.clear();
        vi.clearAllMocks();
        seedCourse();

        const book = {
            id: RECIPE_BOOK_ID,
            courseId: COURSE_ID,
            title: "Recetario a borrar",
            fileName: "recetario_borrar.pdf",
            contentType: "application/pdf",
            sizeBytes: PDF_BYTES.length,
            createdBy: "admin-uid",
            createdAt: "2026-10-01T10:00:00.000Z",
            updatedAt: "2026-10-01T10:00:00.000Z"
        };
        fake.recipeBooks.set(RECIPE_BOOK_ID, book);
        fake.storageFiles.set(RECIPE_BOOK_ID, PDF_BYTES);
    });

    it("deletes recipe book and returns 204 with no content", async () => {
        const response = await adminRequest(
            "delete",
            `/api/admin/courses/${COURSE_ID}/recipe-books/${RECIPE_BOOK_ID}`
        );

        expect(response.status).toBe(204);
        expect(response.body).toEqual({});
        expect(fake.recipeBooks.has(RECIPE_BOOK_ID)).toBe(false);
        expect(fake.storageFiles.has(RECIPE_BOOK_ID)).toBe(false);

        // Subsequent get returns 404
        const check = await adminRequest(
            "get",
            `/api/admin/courses/${COURSE_ID}/recipe-books/${RECIPE_BOOK_ID}/file`
        );
        expect(check.status).toBe(404);
    });

    it("returns 204 even if storage deletion encounters an error", async () => {
        fake.recipeBookStorage.deleteRecipeBookFile.mockRejectedValueOnce(
            new Error("Storage disk error")
        );

        const response = await adminRequest(
            "delete",
            `/api/admin/courses/${COURSE_ID}/recipe-books/${RECIPE_BOOK_ID}`
        );

        expect(response.status).toBe(204);
        expect(fake.recipeBooks.has(RECIPE_BOOK_ID)).toBe(false);
    });

    it("returns 404 when recipe book belongs to another course", async () => {
        seedCourse("published", "other-course");

        const response = await adminRequest(
            "delete",
            `/api/admin/courses/other-course/recipe-books/${RECIPE_BOOK_ID}`
        );

        expect(response.status).toBe(404);
        expect(response.body.message).toBe("Recipe book not found.");
    });

    it("returns 404 when recipe book id does not exist", async () => {
        const response = await adminRequest(
            "delete",
            `/api/admin/courses/${COURSE_ID}/recipe-books/nonexistent-book`
        );

        expect(response.status).toBe(404);
        expect(response.body.message).toBe("Recipe book not found.");
    });

    it("returns 404 if course does not exist", async () => {
        const response = await adminRequest(
            "delete",
            `/api/admin/courses/nonexistent-course/recipe-books/${RECIPE_BOOK_ID}`
        );

        expect(response.status).toBe(404);
        expect(response.body.message).toBe("Course not found.");
    });

    it("returns 401 without token", async () => {
        const response = await request(app).delete(
            `/api/admin/courses/${COURSE_ID}/recipe-books/${RECIPE_BOOK_ID}`
        );
        expect(response.status).toBe(401);
    });

    it("returns 403 for non-admin user", async () => {
        fake.verifyIdToken.mockResolvedValue({ uid: "user-1", admin: false });
        const response = await request(app)
            .delete(`/api/admin/courses/${COURSE_ID}/recipe-books/${RECIPE_BOOK_ID}`)
            .set("Authorization", "Bearer regular-token");

        expect(response.status).toBe(403);
    });
});

describe("Comprehensive Backend Verification [CIU-69]", () => {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const openApiPath = path.join(__dirname, "../docs/openapi.yaml");
    const SAMPLE_ID = "comprehensive-book-1";
    const PDF_CONTENT = Buffer.from("%PDF-1.4 sample file for CIU-69 tests");

    beforeEach(() => {
        fake.courses.clear();
        fake.recipeBooks.clear();
        fake.storageFiles.clear();
        fake.flags.failCreateRepo = false;
        vi.clearAllMocks();
        seedCourse();

        const book = {
            id: SAMPLE_ID,
            courseId: COURSE_ID,
            title: "Recetario de Coberturas",
            fileName: "coberturas.pdf",
            contentType: "application/pdf",
            sizeBytes: PDF_CONTENT.length,
            createdBy: "confidential-admin-uid-999",
            createdAt: "2026-10-16T12:00:00.000Z",
            updatedAt: "2026-10-16T12:00:00.000Z"
        };
        fake.recipeBooks.set(SAMPLE_ID, book);
        fake.storageFiles.set(SAMPLE_ID, PDF_CONTENT);
    });

    describe("Authorization matrix: invalid token on all 4 endpoints", () => {
        it.each([
            ["POST", `/api/admin/courses/${COURSE_ID}/recipe-books`],
            ["GET", `/api/admin/courses/${COURSE_ID}/recipe-books`],
            ["GET", `/api/admin/courses/${COURSE_ID}/recipe-books/${SAMPLE_ID}/file`],
            ["DELETE", `/api/admin/courses/${COURSE_ID}/recipe-books/${SAMPLE_ID}`]
        ])("returns 401 when token is invalid for %s %s", async (method, url) => {
            fake.verifyIdToken.mockRejectedValueOnce(new Error("Invalid token signature"));

            let req = request(app)[method.toLowerCase()](url).set(
                "Authorization",
                "Bearer invalid-token-xyz"
            );

            if (method === "POST") {
                req = req.attach("file", VALID_PDF_BUFFER, {
                    filename: "test.pdf",
                    contentType: "application/pdf"
                });
            }

            const response = await req;
            expect(response.status).toBe(401);
            expect(response.body).toHaveProperty("message");
        });
    });

    describe("Upload isolation on auth failure", () => {
        it("does not call storage nor repository if authentication fails (no token)", async () => {
            const response = await request(app)
                .post(`/api/admin/courses/${COURSE_ID}/recipe-books`)
                .attach("file", VALID_PDF_BUFFER, {
                    filename: "recetario.pdf",
                    contentType: "application/pdf"
                });

            expect(response.status).toBe(401);
            expect(fake.recipeBookStorage.saveRecipeBookFile).not.toHaveBeenCalled();
            expect(fake.recipeBookRepository.createRecipeBook).not.toHaveBeenCalled();
        });

        it("does not call storage nor repository if authentication fails (invalid token)", async () => {
            fake.verifyIdToken.mockRejectedValueOnce(new Error("Decoding failed"));

            const response = await request(app)
                .post(`/api/admin/courses/${COURSE_ID}/recipe-books`)
                .set("Authorization", "Bearer invalid-token")
                .attach("file", VALID_PDF_BUFFER, {
                    filename: "recetario.pdf",
                    contentType: "application/pdf"
                });

            expect(response.status).toBe(401);
            expect(fake.recipeBookStorage.saveRecipeBookFile).not.toHaveBeenCalled();
            expect(fake.recipeBookRepository.createRecipeBook).not.toHaveBeenCalled();
        });

        it("does not call storage nor repository if user is not admin", async () => {
            fake.verifyIdToken.mockResolvedValueOnce({ uid: "regular-user", admin: false });

            const response = await request(app)
                .post(`/api/admin/courses/${COURSE_ID}/recipe-books`)
                .set("Authorization", "Bearer regular-token")
                .attach("file", VALID_PDF_BUFFER, {
                    filename: "recetario.pdf",
                    contentType: "application/pdf"
                });

            expect(response.status).toBe(403);
            expect(fake.recipeBookStorage.saveRecipeBookFile).not.toHaveBeenCalled();
            expect(fake.recipeBookRepository.createRecipeBook).not.toHaveBeenCalled();
        });
    });

    describe("Unexpected repository and storage errors return 500 without leaking internals", () => {
        it("returns generic 500 when storage fails during upload", async () => {
            fake.recipeBookStorage.saveRecipeBookFile.mockRejectedValueOnce(
                new Error("Disk IO failure /var/secret/path")
            );

            const response = await adminRequest("post", `/api/admin/courses/${COURSE_ID}/recipe-books`)
                .attach("file", VALID_PDF_BUFFER, {
                    filename: "recetario.pdf",
                    contentType: "application/pdf"
                });

            expect(response.status).toBe(500);
            expect(response.body).toEqual({ message: "Could not create recipe book." });
            expect(JSON.stringify(response.body)).not.toContain("Disk IO failure");
            expect(JSON.stringify(response.body)).not.toContain("/var/secret/path");
        });

        it("returns generic 500 when repository fails during listing", async () => {
            fake.recipeBookRepository.getRecipeBooksByCourseId.mockRejectedValueOnce(
                new Error("Firestore query quota exceeded in internal shard 4")
            );

            const response = await adminRequest("get", `/api/admin/courses/${COURSE_ID}/recipe-books`);

            expect(response.status).toBe(500);
            expect(response.body).toEqual({ message: "Could not retrieve recipe books." });
            expect(JSON.stringify(response.body)).not.toContain("shard 4");
            expect(JSON.stringify(response.body)).not.toContain("quota");
        });

        it("returns generic 500 when storage fails during file download", async () => {
            fake.recipeBookStorage.readRecipeBookFile.mockRejectedValueOnce(
                new Error("Chunk decompression corrupted in firestore shard")
            );

            const response = await adminRequest(
                "get",
                `/api/admin/courses/${COURSE_ID}/recipe-books/${SAMPLE_ID}/file`
            );

            expect(response.status).toBe(500);
            expect(response.body).toEqual({ message: "Could not download recipe book." });
            expect(JSON.stringify(response.body)).not.toContain("Chunk decompression");
        });

        it("returns generic 500 when repository fails during deletion", async () => {
            fake.recipeBookRepository.deleteRecipeBook.mockRejectedValueOnce(
                new Error("Firestore transaction deadlock in primary cluster")
            );

            const response = await adminRequest(
                "delete",
                `/api/admin/courses/${COURSE_ID}/recipe-books/${SAMPLE_ID}`
            );

            expect(response.status).toBe(500);
            expect(response.body).toEqual({ message: "Could not delete recipe book." });
            expect(JSON.stringify(response.body)).not.toContain("deadlock");
        });
    });

    describe("Field privacy: createdBy is never leaked", () => {
        it("never leaks createdBy in list response", async () => {
            const response = await adminRequest("get", `/api/admin/courses/${COURSE_ID}/recipe-books`);

            expect(response.status).toBe(200);
            expect(response.body.length).toBeGreaterThan(0);
            for (const item of response.body) {
                expect(item).not.toHaveProperty("createdBy");
            }
            expect(JSON.stringify(response.body)).not.toContain("confidential-admin-uid-999");
        });

        it("never leaks createdBy in upload response", async () => {
            const response = await adminRequest("post", `/api/admin/courses/${COURSE_ID}/recipe-books`)
                .attach("file", VALID_PDF_BUFFER, {
                    filename: "nuevo.pdf",
                    contentType: "application/pdf"
                });

            expect(response.status).toBe(201);
            expect(response.body).not.toHaveProperty("createdBy");
            expect(JSON.stringify(response.body)).not.toContain("admin-uid-123");
        });
    });

    describe("Malicious file name sanitization and Content-Disposition safety", () => {
        it("sanitizes dangerous characters on upload and produces safe Content-Disposition on download", async () => {
            const maliciousFilename = "../../hack\" \r\nInjected-Header: evil\r\nx.pdf";

            const uploadRes = await adminRequest("post", `/api/admin/courses/${COURSE_ID}/recipe-books`)
                .attach("file", VALID_PDF_BUFFER, {
                    filename: maliciousFilename,
                    contentType: "application/pdf"
                });

            expect(uploadRes.status).toBe(201);
            const savedBook = uploadRes.body;
            expect(savedBook.fileName).not.toContain("..");
            expect(savedBook.fileName).not.toContain("/");
            expect(savedBook.fileName).not.toContain("\\");
            expect(savedBook.fileName).not.toContain("\"");
            expect(savedBook.fileName).not.toContain("\r");
            expect(savedBook.fileName).not.toContain("\n");
            expect(savedBook.fileName.endsWith(".pdf")).toBe(true);

            const downloadRes = await adminRequest(
                "get",
                `/api/admin/courses/${COURSE_ID}/recipe-books/${savedBook.id}/file`
            );

            expect(downloadRes.status).toBe(200);
            const disposition = downloadRes.header["content-disposition"];
            expect(disposition).toContain("attachment;");
            expect(disposition).not.toContain("\r");
            expect(disposition).not.toContain("\n");
            expect(downloadRes.header["injected-header"]).toBeUndefined();
        });
    });

    describe("10 + 1 limit and deletion recovery", () => {
        it("blocks 11th recipe book with 409, and allows upload again after deleting one", async () => {
            fake.recipeBooks.clear();
            fake.storageFiles.clear();

            // Seed 10 recipe books
            for (let i = 1; i <= 10; i++) {
                const id = `seeded-book-${i}`;
                fake.recipeBooks.set(id, {
                    id,
                    courseId: COURSE_ID,
                    title: `Recetario ${i}`,
                    fileName: `recetario_${i}.pdf`,
                    contentType: "application/pdf",
                    sizeBytes: 1024,
                    createdBy: "admin-uid",
                    createdAt: `2026-10-01T10:0${i}:00.000Z`,
                    updatedAt: `2026-10-01T10:0${i}:00.000Z`
                });
                fake.storageFiles.set(id, VALID_PDF_BUFFER);
            }

            // 11th upload must fail with 409
            const eleventhRes = await adminRequest("post", `/api/admin/courses/${COURSE_ID}/recipe-books`)
                .attach("file", VALID_PDF_BUFFER, {
                    filename: "eleventh.pdf",
                    contentType: "application/pdf"
                });

            expect(eleventhRes.status).toBe(409);
            expect(eleventhRes.body.message).toMatch(/maximum/i);

            // Delete 1 recipe book
            const deleteRes = await adminRequest(
                "delete",
                `/api/admin/courses/${COURSE_ID}/recipe-books/seeded-book-1`
            );
            expect(deleteRes.status).toBe(204);

            // Now upload should succeed with 201
            const retryRes = await adminRequest("post", `/api/admin/courses/${COURSE_ID}/recipe-books`)
                .attach("file", VALID_PDF_BUFFER, {
                    filename: "new_tenth.pdf",
                    contentType: "application/pdf"
                });

            expect(retryRes.status).toBe(201);
            expect(retryRes.body.fileName).toBe("new_tenth.pdf");
        });
    });

    describe("OpenAPI schema conformity", () => {
        it("matches the RecipeBook schema defined in openapi.yaml exactly", async () => {
            const rawYaml = fs.readFileSync(openApiPath, "utf8");
            const spec = YAML.parse(rawYaml);
            const recipeBookSchema = spec.components?.schemas?.RecipeBook;

            expect(recipeBookSchema).toBeDefined();
            expect(recipeBookSchema.type).toBe("object");

            const expectedProperties = Object.keys(recipeBookSchema.properties).sort();
            const requiredProperties = recipeBookSchema.required || [];

            const uploadRes = await adminRequest("post", `/api/admin/courses/${COURSE_ID}/recipe-books`)
                .attach("file", VALID_PDF_BUFFER, {
                    filename: "openapi_check.pdf",
                    contentType: "application/pdf"
                })
                .field("title", "Verificación OpenAPI");

            expect(uploadRes.status).toBe(201);
            const responseBody = uploadRes.body;
            const actualKeys = Object.keys(responseBody).sort();

            expect(actualKeys).toEqual(expectedProperties);

            for (const requiredProp of requiredProperties) {
                expect(responseBody).toHaveProperty(requiredProp);
                expect(responseBody[requiredProp]).not.toBeNull();
            }

            expect(typeof responseBody.id).toBe("string");
            expect(typeof responseBody.courseId).toBe("string");
            expect(typeof responseBody.title).toBe("string");
            expect(typeof responseBody.fileName).toBe("string");
            expect(typeof responseBody.contentType).toBe("string");
            expect(typeof responseBody.sizeBytes).toBe("number");
            expect(responseBody.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
            expect(responseBody.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
        });
    });
});


