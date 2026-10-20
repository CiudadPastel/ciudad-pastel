import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

const fake = vi.hoisted(() => ({
    enrollments: [], books: [], files: new Map(),
    lookup: vi.fn(), course: vi.fn(), booksLookup: vi.fn(), auth: vi.fn(),
    enrollmentById: vi.fn(), bookById: vi.fn(), readFile: vi.fn()
}));

vi.mock("dotenv", () => ({ default: { config: vi.fn() } }));
vi.mock("firebase-admin/app", () => { throw new Error("Real Firebase access is forbidden."); });
vi.mock("../src/config/firebase.js", () => ({ auth: { verifyIdToken: fake.auth }, db: {} }));
vi.mock("../src/repositories/enrollment.repository.js", () => ({
    getActiveEnrollmentsByIdNumber: fake.lookup,
    getEnrollmentById: fake.enrollmentById,
    createEnrollment: vi.fn(), getEnrollmentsByCourse: vi.fn(), updateEnrollment: vi.fn()
}));
vi.mock("../src/repositories/course.repository.js", () => ({ getCourseById: fake.course }));
vi.mock("../src/repositories/recipe-book.repository.js", () => ({
    getRecipeBooksByCourseId: fake.booksLookup,
    countRecipeBooksByCourseId: vi.fn(), createRecipeBook: vi.fn(),
    deleteRecipeBook: vi.fn(), getRecipeBookById: fake.bookById
}));
vi.mock("../src/storage/recipe-book.storage.js", () => ({
    readRecipeBookFile: fake.readFile, saveRecipeBookFile: vi.fn(), deleteRecipeBookFile: vi.fn()
}));

import app from "../src/app.js";
import { enrollmentRequestRateLimit, studentVerificationRateLimit } from "../src/middleware/rate-limit.middleware.js";
import { createStudentAccessToken, verifyStudentAccessToken } from "../src/services/student-access-token.service.js";
import { validateStudentAccessInput } from "../src/validators/student-access.validator.js";

const person = { fullName: "Ana Mora", idNumber: "105380021", phone: "88887777" };
const failure = { message: "We couldn't find an enrollment with this data." };
const PDF = Buffer.from("%PDF-1.4\nstudent recipe book\n%%EOF\n");
const verify = (body = person) => request(app).post("/api/student-access/verify").send(body);
const enrollment = (id = "enrollment-1", courseId = "course-1") => ({
    ...person, id, courseId, courseName: "Taller de macarons", status: "enrolled", note: "private note"
});
const book = (id = "book-1", courseId = "course-1") => ({
    id, courseId, title: "Macarons", fileName: "macarons.pdf", sizeBytes: 12345,
    createdBy: "admin", storagePath: "private/path", createdAt: "2026-10-01"
});

beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("STUDENT_ACCESS_TOKEN_SECRET", "test-only-student-secret-at-least-32-bytes");
    studentVerificationRateLimit.reset();
    enrollmentRequestRateLimit.reset();
    fake.enrollments = [enrollment()];
    fake.books = [book()];
    fake.files = new Map([["book-1", PDF]]);
    fake.enrollmentById.mockImplementation(async (id) => fake.enrollments.find((e) => e.id === id) ?? null);
    fake.bookById.mockImplementation(async (id) => fake.books.find((b) => b.id === id) ?? null);
    fake.readFile.mockImplementation(async (id) => fake.files.get(id) ?? null);
    fake.lookup.mockImplementation(async (idNumber) => fake.enrollments.filter((e) => e.idNumber === idNumber && e.status === "enrolled"));
    fake.booksLookup.mockImplementation(async (id) => fake.books.filter((b) => b.courseId === id));
    fake.course.mockImplementation(async (id) => ({ id, name: "Taller de macarons", status: "published" }));
});

describe("GET /api/student-access/courses/:courseId/recipe-books/:recipeBookId/file", () => {
    const tokenFor = (courseIds = ["course-1"], enrollmentIds = ["enrollment-1"], options) =>
        createStudentAccessToken({ courseIds, enrollmentIds }, options);
    const file = (token, courseId = "course-1", recipeBookId = "book-1") => {
        const req = request(app).get(`/api/student-access/courses/${courseId}/recipe-books/${recipeBookId}/file`);
        return token === undefined ? req : req.set("Authorization", `Bearer ${token}`);
    };
    const expectSafeError = (response, status, message, token = "unused-token") => {
        expect(response.status).toBe(status);
        expect(response.body).toEqual({ message });
        const output = `${response.text} ${JSON.stringify(response.headers)}`;
        for (const privateValue of ["enrollment-1", person.idNumber, person.phone, token,
            "private/path", "internal exception", "createdBy", "STUDENT_ACCESS_TOKEN_SECRET"]) {
            expect(output).not.toContain(privateValue);
        }
        expect(response.headers["cache-control"]).toBe("private, no-store");
        expect(fake.auth).not.toHaveBeenCalled();
    };
    const expectNoDataAccess = () => {
        expect(fake.enrollmentById).not.toHaveBeenCalled();
        expect(fake.bookById).not.toHaveBeenCalled();
        expect(fake.readFile).not.toHaveBeenCalled();
    };

    it.each([undefined, "Basic abc", "Bearer", "Bearer ", "Bearer one two", "Bearer abc", "Bearer a.b.c"])("rejects missing or malformed authorization: %j", async (header) => {
        const req = file();
        if (header !== undefined) req.set("Authorization", header);
        const response = await req;
        expectSafeError(response, 401, "Invalid or expired student access token.");
        expectNoDataAccess();
    });

    it.each(["payload", "signature"])("rejects modified token %s before data access", async (part) => {
        const [payload, signature] = tokenFor().split(".");
        const token = part === "payload"
            ? `${Buffer.from(JSON.stringify({ courseIds: ["course-2"] })).toString("base64url")}.${signature}`
            : `${payload}.${signature[0] === "a" ? "b" : "a"}${signature.slice(1)}`;
        expectSafeError(await file(token), 401, "Invalid or expired student access token.", token);
        expectNoDataAccess();
    });

    it("rejects expired tokens before data access", async () => {
        const token = tokenFor(undefined, undefined, { now: Math.floor(Date.now() / 1000) - 900 });
        expectSafeError(await file(token), 401, "Invalid or expired student access token.", token);
        expectNoDataAccess();
    });

    it.each([undefined, "", "short"])("returns safe 500 for invalid server configuration %j regardless of header validity", async (secret) => {
        const token = tokenFor();
        vi.stubEnv("STUDENT_ACCESS_TOKEN_SECRET", secret);
        const log = vi.spyOn(console, "error").mockImplementation(() => {});
        for (const supplied of [undefined, "malformed", token]) {
            expectSafeError(await file(supplied), 500, "Could not retrieve recipe book.", token);
        }
        expectNoDataAccess();
        expect(log).not.toHaveBeenCalled();
    });

    it("uses a token from verification to return exact PDF bytes and inline headers without Firebase auth", async () => {
        const verified = await verify();
        expect(verified.status).toBe(200);
        const response = await file(verified.body.accessToken);
        expect(response.status).toBe(200);
        expect(response.body).toEqual(PDF);
        expect(response.headers["content-type"]).toBe("application/pdf");
        expect(response.headers["content-disposition"]).toBe('inline; filename="macarons.pdf"');
        expect(response.headers["content-length"]).toBe(String(PDF.length));
        expect(response.headers["cache-control"]).toBe("private, no-store");
        expect(response.headers["x-content-type-options"]).toBe("nosniff");
        expect(fake.enrollmentById).toHaveBeenCalledWith("enrollment-1");
        expect(fake.bookById).toHaveBeenCalledWith("book-1");
        expect(fake.readFile).toHaveBeenCalledWith("book-1");
        expect(fake.auth).not.toHaveBeenCalled();
        expect(response.headers.location).toBeUndefined();
        const output = `${response.body.toString()} ${JSON.stringify(response.headers)}`;
        for (const privateValue of ["enrollment-1", person.idNumber, person.phone, verified.body.accessToken,
            "private/path", "createdBy", "chunk"]) expect(output).not.toContain(privateValue);
    });

    it("serves the specifically requested book when the course has multiple books", async () => {
        const otherPdf = Buffer.from("%PDF-1.4\nsecond recipe book\n%%EOF");
        fake.books.push(book("book-2"));
        fake.files.set("book-2", otherPdf);
        const response = await file(tokenFor(), "course-1", "book-2");
        expect(response.status).toBe(200);
        expect(response.body).toEqual(otherPdf);
        expect(fake.readFile).toHaveBeenCalledWith("book-2");
    });

    it.each(['macarons.pdf', 'recetario ñ.pdf', 'recetario_"quoted".pdf'])("safely encodes the stored filename %s for inline viewing", async (fileName) => {
        fake.books[0].fileName = fileName;
        const response = await file(tokenFor());
        expect(response.status).toBe(200);
        expect(response.headers["content-disposition"]).toMatch(/^inline; filename=/);
        expect(response.headers["content-disposition"]).not.toMatch(/[\r\n]/);
        if (fileName.includes('"')) expect(response.headers["content-disposition"]).toContain('\\"quoted\\"');
        if (fileName.includes("ñ")) expect(response.headers["content-disposition"]).toContain("filename*=UTF-8''");
    });

    it("denies a course absent from token claims before retrieving enrollment or book data", async () => {
        fake.enrollments.push(enrollment("enrollment-2", "course-2"));
        const token = tokenFor();
        expectSafeError(await file(token, "course-2"), 403, "Student access is not authorized for this course.", token);
        expectNoDataAccess();
    });

    it.each(["cancelled", "missing", "different course"])("denies an enrollment that is %s after token issuance", async (state) => {
        const verified = await verify();
        const token = verified.body.accessToken;
        if (state === "cancelled") fake.enrollments[0].status = "cancelled";
        if (state === "missing") fake.enrollments = [];
        if (state === "different course") fake.enrollments[0].courseId = "course-2";
        expectSafeError(await file(token), 403, "Student access is not authorized for this course.", token);
        expect(fake.enrollmentById).toHaveBeenCalledWith("enrollment-1");
        expect(fake.bookById).not.toHaveBeenCalled();
        expect(fake.readFile).not.toHaveBeenCalled();
    });

    it("does not authorize using active enrollments absent from the signed token", async () => {
        fake.enrollments[0].status = "cancelled";
        fake.enrollments.push(enrollment("unrepresented-enrollment"));
        expectSafeError(await file(tokenFor()), 403, "Student access is not authorized for this course.");
        expect(fake.enrollmentById).toHaveBeenCalledTimes(1);
        expect(fake.readFile).not.toHaveBeenCalled();
    });

    it("allows access while at least one represented enrollment is active for the requested course", async () => {
        fake.enrollments.push(enrollment("enrollment-2"));
        const verified = await verify();
        fake.enrollments[0].status = "cancelled";
        expect((await file(verified.body.accessToken)).status).toBe(200);
        expect(fake.enrollmentById).toHaveBeenCalledWith("enrollment-2");
    });

    it("does not authorize a course omitted at verification because it had no books", async () => {
        fake.books = [];
        const verified = await verify();
        fake.books.push(book());
        expectSafeError(await file(verified.body.accessToken), 403, "Student access is not authorized for this course.");
        expectNoDataAccess();
    });

    it.each(["missing book", "different course", "missing binary", "missing course"])("returns the same safe 404 for %s", async (state) => {
        const token = tokenFor();
        if (state === "missing book") fake.books = [];
        if (state === "different course") fake.books[0].courseId = "course-2";
        if (state === "missing binary") fake.files.clear();
        if (state === "missing course") fake.course.mockResolvedValueOnce(null);
        expectSafeError(await file(token), 404, "Recipe book not found.", token);
        if (state !== "missing binary") expect(fake.readFile).not.toHaveBeenCalled();
    });

    it.each(["enrollment", "course", "metadata", "storage"])("returns safe 500 for unexpected %s failures without logging sensitive data", async (boundary) => {
        const token = tokenFor();
        const log = vi.spyOn(console, "error").mockImplementation(() => {});
        const mock = { enrollment: fake.enrollmentById, course: fake.course, metadata: fake.bookById, storage: fake.readFile }[boundary];
        mock.mockRejectedValueOnce(new Error(`internal exception private/path enrollment-1 ${person.idNumber} ${person.phone} ${token}`));
        expectSafeError(await file(token), 500, "Could not retrieve recipe book.", token);
        expect(log).not.toHaveBeenCalled();
    });
});

afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("POST /api/student-access/verify", () => {
    it("verifies publicly with safe metadata and no administrative authentication", async () => {
        const response = await verify();
        expect(response.status).toBe(200);
        expect(response.body).toEqual({
            accessToken: expect.any(String), expiresIn: 900,
            courses: [{ id: "course-1", name: "Taller de macarons", recipeBooks: [
                { id: "book-1", title: "Macarons", fileName: "macarons.pdf", sizeBytes: 12345 }
            ] }]
        });
        expect(fake.auth).not.toHaveBeenCalled();
        expect(fake.course).toHaveBeenCalledWith("course-1");
        expect(fake.lookup).toHaveBeenCalledWith("105380021");
        expect(JSON.stringify(response.body)).not.toContain("enrollment-1");
    });

    it("does not require an exact name match", async () => {
        expect((await verify({ ...person, fullName: "Nombre diferente" })).status).toBe(200);
    });

    it.each([
        { ...person, idNumber: "1-0538 0021" },
        { ...person, phone: "8888-77 77" },
        { ...person, idNumber: "1 0538-0021", phone: "8888 7777" }
    ])("normalizes ID and phone using existing enrollment rules: %j", async (body) => {
        expect((await verify(body)).status).toBe(200);
        expect(fake.lookup).toHaveBeenCalledWith(person.idNumber);
    });

    it("accepts DIMEX using the existing format rules", async () => {
        fake.enrollments[0].idNumber = "155123456789";
        expect((await verify({ ...person, idNumber: "155-123 456789" })).status).toBe(200);
    });

    it.each(["wrong ID", "wrong phone", "cancelled enrollment", "phone from another enrollment"])("returns the identical generic 401 for %s", async (scenario) => {
        const body = { ...person };
        if (scenario === "wrong ID") body.idNumber = "205380021";
        if (scenario === "wrong phone") body.phone = "60001111";
        if (scenario === "cancelled enrollment") fake.enrollments[0].status = "cancelled";
        if (scenario === "phone from another enrollment") {
            fake.enrollments[0].phone = "60001111";
            fake.enrollments.push({ ...enrollment("other"), idNumber: "205380021" });
        }
        const response = await verify(body);
        expect(response.status).toBe(401);
        expect(response.body).toEqual(failure);
        expect(fake.booksLookup).not.toHaveBeenCalled();
    });

    it("returns all eligible courses and multiple safe recipe books, omitting courses without books", async () => {
        fake.enrollments.push(enrollment("enrollment-2", "course-2"), enrollment("enrollment-3", "course-3"));
        fake.books.push(book("book-2"), book("book-3", "course-2"));
        const response = await verify();
        expect(response.status).toBe(200);
        expect(response.body.courses.map((c) => c.id)).toEqual(["course-1", "course-2"]);
        expect(response.body.courses[0].recipeBooks).toHaveLength(2);
        const claims = verifyStudentAccessToken(response.body.accessToken);
        expect(claims.enrollmentIds).toEqual(["enrollment-1", "enrollment-2", "enrollment-3"]);
        expect(claims.courseIds).toEqual(["course-1", "course-2"]);
    });

    it("succeeds with a valid token and empty courses when no recipe books exist", async () => {
        fake.books = [];
        const response = await verify();
        expect(response.status).toBe(200);
        expect(response.body.courses).toEqual([]);
        expect(verifyStudentAccessToken(response.body.accessToken).courseIds).toEqual([]);
    });

    it("issues a verifiable token with expiration and no personal data", async () => {
        const response = await verify();
        const claims = verifyStudentAccessToken(response.body.accessToken);
        expect(claims.exp - claims.iat).toBe(900);
        expect(claims.iat).toBeLessThanOrEqual(Math.floor(Date.now() / 1000));
        expect(Object.keys(claims).sort()).toEqual(["courseIds", "enrollmentIds", "exp", "iat"]);
    });

    it.each([{}, [], { ...person, fullName: " " }, { ...person, fullName: 12 },
        { ...person, idNumber: "905380021" }, { ...person, idNumber: 105380021 },
        { ...person, phone: "123" }, { ...person, phone: 88887777 },
        { fullName: person.fullName }, { ...person, idNumber: "" }, { ...person, phone: "" }
    ])("rejects malformed input with the existing JSON validation style: %j", async (body) => {
        const response = await verify(body);
        expect(response.status).toBe(400);
        expect(response.body).toEqual({ message: "Student verification validation failed.", errors: expect.any(Array) });
        expect(fake.lookup).not.toHaveBeenCalled();
    });

    it("trims the collected name, ignores email, and returns only verification fields", () => {
        expect(validateStudentAccessInput({ ...person, fullName: "  Ana   Mora  ", email: "ignored@example.com" }).data).toEqual(person);
    });

    it.each(['{"idNumber":"105380021",', JSON.stringify({ ...person, fullName: "x".repeat(110000) })])("rejects invalid or oversized JSON safely", async (body) => {
        const log = vi.spyOn(console, "error").mockImplementation(() => {});
        const response = await request(app).post("/api/student-access/verify").set("Content-Type", "application/json").send(body);
        expect(response.status).toBe(400);
        expect(response.body).toEqual({
            message: "Student verification validation failed.",
            errors: ["Student verification body must be a valid JSON object within 100 KB."]
        });
        expect(fake.lookup).not.toHaveBeenCalled();
        expect(log).not.toHaveBeenCalled();
    });

    it("limits all attempts independently of enrollment requests and resets for tests", async () => {
        for (let i = 0; i < 5; i += 1) expect((await verify({ ...person, phone: "60001111" })).status).toBe(401);
        enrollmentRequestRateLimit.reset();
        const limited = await verify();
        expect(limited.status).toBe(429);
        expect(limited.body).toEqual({ message: "Too many verification attempts. Please try again later." });
        expect(Number(limited.headers["retry-after"])).toBeGreaterThan(0);
        studentVerificationRateLimit.reset();
        expect((await verify()).status).toBe(200);
    });

    it("maps unexpected repository errors to a safe 500 without logging sensitive data", async () => {
        const log = vi.spyOn(console, "error").mockImplementation(() => {});
        fake.lookup.mockRejectedValueOnce(new Error(`private ${person.idNumber} ${person.phone}`));
        const response = await verify();
        expect(response.status).toBe(500);
        expect(response.body).toEqual({ message: "Could not verify student access." });
        expect(log).not.toHaveBeenCalled();
    });

    it.each([undefined, "", "short"])("fails identically before enrollment lookup for matching and nonmatching credentials with invalid secret %j", async (secret) => {
        vi.stubEnv("STUDENT_ACCESS_TOKEN_SECRET", secret);
        const log = vi.spyOn(console, "error").mockImplementation(() => {});
        for (const body of [person, { ...person, idNumber: "205380021" }, { ...person, phone: "60001111" }]) {
            const response = await verify(body);
            expect(response.status).toBe(500);
            expect(response.body).toEqual({ message: "Could not verify student access." });
        }
        expect(fake.lookup).not.toHaveBeenCalled();
        expect(fake.booksLookup).not.toHaveBeenCalled();
        expect(log).not.toHaveBeenCalled();
    });

    it("still rejects malformed input before checking missing token configuration", async () => {
        vi.stubEnv("STUDENT_ACCESS_TOKEN_SECRET", undefined);
        const response = await verify({});
        expect(response.status).toBe(400);
        expect(response.body.message).toBe("Student verification validation failed.");
        expect(fake.lookup).not.toHaveBeenCalled();
    });

    it("responds from the Express app health route without real Firebase", async () => {
        expect((await request(app).get("/api/health")).body.status).toBe("ok");
    });
});

describe("reusable student access token verifier", () => {
    const claims = { enrollmentIds: ["enrollment-1"], courseIds: ["course-1"] };

    it.each(["", "bad", "a.b.c", "!.!", null, "a.YQ"])("rejects malformed tokens: %j", (token) => {
        expect(() => verifyStudentAccessToken(token)).toThrow("Invalid or expired student access token.");
    });

    it("rejects a modified payload or signature", () => {
        const token = createStudentAccessToken(claims);
        const [payload, signature] = token.split(".");
        const changed = Buffer.from(JSON.stringify({ ...claims, exp: 9999999999 })).toString("base64url");
        expect(() => verifyStudentAccessToken(`${changed}.${signature}`)).toThrow();
        expect(() => verifyStudentAccessToken(`${payload}.${signature[0] === "a" ? "b" : "a"}${signature.slice(1)}`)).toThrow();
    });

    it("accepts before expiration and rejects at and after expiration", () => {
        const token = createStudentAccessToken(claims, { now: 1000 });
        expect(verifyStudentAccessToken(token, { now: 1899 }).exp).toBe(1900);
        expect(() => verifyStudentAccessToken(token, { now: 1900 })).toThrow();
        expect(() => verifyStudentAccessToken(token, { now: 1901 })).toThrow();
        expect(() => verifyStudentAccessToken(token, { now: 999 })).toThrow();
    });

    it("requires a configured secret and supports deterministic injection", () => {
        vi.stubEnv("STUDENT_ACCESS_TOKEN_SECRET", "");
        expect(() => createStudentAccessToken(claims)).toThrow("STUDENT_ACCESS_TOKEN_SECRET");
        expect(() => verifyStudentAccessToken("bad")).toThrow("STUDENT_ACCESS_TOKEN_SECRET");
        const options = { secret: "injected-test-only-secret-with-32-bytes", now: 1000 };
        const token = createStudentAccessToken(claims, options);
        expect(createStudentAccessToken(claims, options)).toBe(token);
        expect(verifyStudentAccessToken(token, options)).toEqual({ ...claims, iat: 1000, exp: 1900 });
        expect(() => verifyStudentAccessToken(token, { ...options, secret: "another-test-only-secret-with-32-bytes" })).toThrow();
    });
});
