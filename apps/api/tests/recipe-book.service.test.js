import { beforeEach, describe, expect, it, vi } from "vitest";

const fake = vi.hoisted(() => {
    const courses = new Map();
    const recipeBooks = new Map();
    const storageFiles = new Map();

    return {
        courses,
        recipeBooks,
        storageFiles,
        courseRepository: {
            getCourseById: vi.fn((id) => Promise.resolve(courses.get(id) || null))
        },
        recipeBookRepository: {
            createRecipeBook: vi.fn(),
            getRecipeBookById: vi.fn((id) => Promise.resolve(recipeBooks.get(id) || null)),
            getRecipeBooksByCourseId: vi.fn((courseId) => {
                const list = Array.from(recipeBooks.values())
                    .filter((rb) => rb.courseId === courseId);
                return Promise.resolve(list);
            }),
            countRecipeBooksByCourseId: vi.fn(),
            deleteRecipeBook: vi.fn()
        },
        recipeBookStorage: {
            saveRecipeBookFile: vi.fn(),
            readRecipeBookFile: vi.fn((id) => Promise.resolve(storageFiles.get(id) || null)),
            deleteRecipeBookFile: vi.fn()
        }
    };
});

vi.mock("dotenv", () => ({ default: { config: vi.fn() } }));
vi.mock("firebase-admin/app", () => {
    throw new Error("Real Firebase app access is forbidden.");
});
vi.mock("../src/config/firebase.js", () => ({
    auth: { verifyIdToken: vi.fn() },
    db: { collection: vi.fn() }
}));
vi.mock("../src/repositories/course.repository.js", () => fake.courseRepository);
vi.mock("../src/repositories/recipe-book.repository.js", () => fake.recipeBookRepository);
vi.mock("../src/storage/recipe-book.storage.js", () => fake.recipeBookStorage);

import {
    findRecipeBooksByCourse,
    getRecipeBookFileForCourse
} from "../src/services/recipe-book.service.js";

const COURSE_ID = "course-student-test";

describe("recipe-book.service (student features for HU-A06)", () => {
    beforeEach(() => {
        fake.courses.clear();
        fake.recipeBooks.clear();
        fake.storageFiles.clear();
        vi.clearAllMocks();

        fake.courses.set(COURSE_ID, {
            id: COURSE_ID,
            name: "Curso de Galletas Decoradas",
            status: "published"
        });
    });

    describe("findRecipeBooksByCourse", () => {
        it("returns empty array when course exists but has no recipe books", async () => {
            const result = await findRecipeBooksByCourse(COURSE_ID);
            expect(result).toEqual([]);
        });

        it("throws NotFoundError if course does not exist", async () => {
            await expect(findRecipeBooksByCourse("nonexistent-course")).rejects.toThrow(
                "Course not found."
            );
        });

        it("returns only student-facing fields without createdBy or timestamps", async () => {
            fake.recipeBooks.set("rb-1", {
                id: "rb-1",
                courseId: COURSE_ID,
                title: "Recetario de Galletas",
                fileName: "galletas.pdf",
                contentType: "application/pdf",
                sizeBytes: 4096,
                createdBy: "secret-admin-uid",
                createdAt: "2026-10-01T10:00:00.000Z",
                updatedAt: "2026-10-01T10:00:00.000Z"
            });

            const result = await findRecipeBooksByCourse(COURSE_ID);

            expect(result).toEqual([
                {
                    id: "rb-1",
                    title: "Recetario de Galletas",
                    fileName: "galletas.pdf",
                    sizeBytes: 4096
                }
            ]);

            // Ensure no internal fields leak
            expect(result[0]).not.toHaveProperty("createdBy");
            expect(result[0]).not.toHaveProperty("createdAt");
            expect(result[0]).not.toHaveProperty("updatedAt");
            expect(result[0]).not.toHaveProperty("courseId");
        });
    });

    describe("getRecipeBookFileForCourse", () => {
        const BOOK_ID = "book-student-download";
        const PDF_BUFFER = Buffer.from("%PDF-1.4 student file content");

        beforeEach(() => {
            fake.recipeBooks.set(BOOK_ID, {
                id: BOOK_ID,
                courseId: COURSE_ID,
                title: "Recetario de Galletas",
                fileName: "galletas.pdf",
                sizeBytes: PDF_BUFFER.length,
                createdBy: "admin-uid"
            });
            fake.storageFiles.set(BOOK_ID, PDF_BUFFER);
        });

        it("returns file name and identical binary buffer", async () => {
            const result = await getRecipeBookFileForCourse(COURSE_ID, BOOK_ID);

            expect(result.fileName).toBe("galletas.pdf");
            expect(Buffer.compare(result.buffer, PDF_BUFFER)).toBe(0);
        });

        it("throws NotFoundError if course does not exist", async () => {
            await expect(
                getRecipeBookFileForCourse("nonexistent-course", BOOK_ID)
            ).rejects.toThrow("Course not found.");
        });

        it("throws NotFoundError if recipe book does not exist", async () => {
            await expect(
                getRecipeBookFileForCourse(COURSE_ID, "nonexistent-book")
            ).rejects.toThrow("Recipe book not found.");
        });

        it("throws NotFoundError if recipe book belongs to a different course", async () => {
            fake.courses.set("other-course", { id: "other-course", status: "published" });

            await expect(
                getRecipeBookFileForCourse("other-course", BOOK_ID)
            ).rejects.toThrow("Recipe book not found.");
        });

        it("throws NotFoundError if binary file is missing from storage", async () => {
            fake.storageFiles.delete(BOOK_ID);

            await expect(
                getRecipeBookFileForCourse(COURSE_ID, BOOK_ID)
            ).rejects.toThrow("Recipe book file not found.");
        });
    });
});
