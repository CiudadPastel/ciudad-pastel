import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

const fake = vi.hoisted(() => ({
    getCourses: vi.fn(),
    getCourseById: vi.fn(),
    countActiveEnrollmentsByCourse: vi.fn(),
    verifyIdToken: vi.fn()
}));

vi.mock("dotenv", () => ({ default: { config: vi.fn() } }));
vi.mock("../src/config/firebase.js", () => ({
    auth: { verifyIdToken: fake.verifyIdToken },
    db: {}
}));
vi.mock("../src/repositories/course.repository.js", () => ({
    getCourses: fake.getCourses,
    getCourseById: fake.getCourseById
}));
vi.mock("../src/repositories/enrollment.repository.js", () => ({
    countActiveEnrollmentsByCourse: fake.countActiveEnrollmentsByCourse
}));

import app from "../src/app.js";
import { COURSE_STATUS, toPublicCourse } from "../src/models/course.model.js";

const catalog = "/api/courses";
const options = `${catalog}/filter-options`;

function course(id, overrides = {}) {
    return {
        id,
        name: "Éclairs",
        summary: "Decoración con glaseado",
        description: "Aprende técnicas de pastelería francesa.",
        instructor: "Ángela Núñez",
        price: 25000,
        capacity: 8,
        seasonName: null,
        schedule: { startDate: "2026-11-20", endDate: "2026-11-25" },
        status: COURSE_STATUS.PUBLISHED,
        reservationAmount: 5000,
        internalNote: "Dato administrativo",
        updatedAt: "2026-11-08T12:00:00.000Z",
        ...overrides
    };
}

beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-09T12:00:00Z"));
    fake.getCourses.mockResolvedValue([]);
    fake.countActiveEnrollmentsByCourse.mockResolvedValue(new Map());
});

afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
});

async function expectCatalogIds(query, ids) {
    const response = await request(app).get(catalog).query(query);
    expect(response.status).toBe(200);
    expect(response.body.map(({ id }) => id)).toEqual(ids);
}

describe("GET /api/courses filters", () => {
    beforeEach(() => {
        fake.getCourses.mockResolvedValue([
            course("free", { name: "Bizcocho", instructor: "Rocío Ruiz", price: 0,
                schedule: { startDate: "2026-11-22" } }),
            course("paid"),
            course("legacy", { name: "Taller sin horario", instructor: null, price: null,
                schedule: { description: "Horario por confirmar" } }),
            course("seasonal", { name: "Galletas", instructor: "Ángela Núñez Mora", price: 45000,
                seasonName: "Navidad", schedule: { startDate: "2026-11-18", endDate: "2026-12-03" } })
        ]);
    });

    it.each([
        [{ q: "ÉCLAIRS DECORACION francesa" }, ["paid"]],
        [{ instructor: "  ANGELA   nunez " }, ["paid"]],
        [{ minPrice: "25000" }, ["seasonal", "paid"]],
        [{ maxPrice: "25000" }, ["paid", "free"]],
        [{ from: "2026-11-20" }, ["paid", "free"]],
        [{ to: "2026-11-20" }, ["seasonal", "paid"]],
        [{ instructor: "Instructora inexistente" }, []],
        [{ q: "Dato administrativo" }, []],
        [{ q: "Éclairs caramelo" }, []]
    ])("applies %j to the public catalog", async (query, ids) => {
        await expectCatalogIds(query, ids);
    });

    it.each([
        [{ minPrice: "0", maxPrice: "0" }, ["free"]],
        [{ from: "2026-11-20", to: "2026-11-20" }, ["paid"]],
        [{ from: "2026-11-20", to: "2026-11-22", maxPrice: "25000" }, ["paid", "free"]],
        [{ q: "éclairs glaseado", instructor: "angela nunez", minPrice: "25000", maxPrice: "25000",
            from: "2026-11-20", to: "2026-11-20" }, ["paid"]],
        [{ instructor: "angela nunez", maxPrice: "0" }, []],
        [{ from: "2028-02-29", minPrice: "9007199254740991" }, []]
    ])("intersects %j with inclusive limits", async (query, ids) => {
        await expectCatalogIds(query, ids);
    });

    it("keeps the legacy array, sorts ties by ID and uses the existing capacity calculation", async () => {
        const last = course("tie-z");
        const first = course("tie-a");
        const earlierName = course("alfajor", { name: "Alfajor" });
        const noSchedule = course("undated", { schedule: null });
        const ended = course("ended", { schedule: { startDate: "2026-11-08" } });
        fake.getCourses.mockResolvedValue([last, noSchedule, earlierName, first, ended,
            course("draft", { status: COURSE_STATUS.DRAFT }),
            course("archived", { status: COURSE_STATUS.ARCHIVED })]);
        fake.countActiveEnrollmentsByCourse.mockResolvedValue(new Map([[first.id, 3]]));

        const response = await request(app).get(catalog).query({ status: "draft", season: "Navidad" });
        expect(response.status).toBe(200);
        expect(response.body).toEqual([
            toPublicCourse(earlierName), toPublicCourse(first, 3), toPublicCourse(last), toPublicCourse(noSchedule)
        ]);
        expect(response.body[1].remainingSpots).toBe(5);
        expect(response.body[1]).not.toHaveProperty("status");
        expect(response.body[1]).not.toHaveProperty("internalNote");
        expect(response.body[1]).not.toHaveProperty("updatedAt");
        expect(fake.verifyIdToken).not.toHaveBeenCalled();
        expect(fake.getCourses).toHaveBeenCalledExactlyOnceWith(COURSE_STATUS.PUBLISHED);
        expect(fake.countActiveEnrollmentsByCourse).toHaveBeenCalledTimes(1);
    });

    it("excludes invalid prices only when filtering by price", async () => {
        fake.getCourses.mockResolvedValue([
            course("null", { price: null }),
            course("negative", { price: -1 }),
            course("decimal", { price: 1.5 }),
            course("unsafe", { price: 9007199254740992 }),
            course("string", { price: "0" }),
            course("free", { price: 0 })
        ]);
        await expectCatalogIds({}, ["decimal", "free", "negative", "null", "string", "unsafe"]);
        await expectCatalogIds({ minPrice: "0" }, ["free"]);
    });

    it.each([
        ["q=", "q"], ["q=%20%20", "q"], ["q=---", "q"], [`q=${"a".repeat(101)}`, "q"],
        ["instructor=", "instructor"], ["instructor=%20", "instructor"],
        [`instructor=${"a".repeat(121)}`, "instructor"],
        ["minPrice=", "minPrice"], ["minPrice=-1", "minPrice"], ["minPrice=1.5", "minPrice"],
        ["minPrice=abc", "minPrice"], ["minPrice=Infinity", "minPrice"],
        ["minPrice=9007199254740992", "minPrice"], ["minPrice=1e3", "minPrice"],
        ["minPrice=0x10", "minPrice"], ["minPrice=%2B1", "minPrice"], ["minPrice=1%0A", "minPrice"],
        ["maxPrice=%20", "maxPrice"], ["minPrice=10&maxPrice=1", "minPrice"],
        ["from=", "from"], ["from=2026-2-01", "from"], ["to=2026-02-30", "to"],
        ["from=2026-02-29", "from"], ["to=2026-11-25T00%3A00%3A00Z", "to"],
        ["from=2026-11-30&to=2026-11-29", "from"],
        ["q=a&q=b", "q"], ["instructor=a&instructor=a", "instructor"],
        ["maxPrice=1&maxPrice=2", "maxPrice"],
        ["q%5B%5D=eclairs", "q"], ["instructor%5Bname%5D=Angela", "instructor"],
        ["minPrice%5B0%5D=0", "minPrice"], ["from%5Bdate%5D=2026-11-20", "from"],
        ["q=eclairs&q%5B%5D=extra", "q"],
        [`${"unused=1&".repeat(1000)}minPrice=-1`, "minPrice"]
    ])("rejects %s before querying the repositories", async (query, field) => {
        const response = await request(app).get(`${catalog}?${query}`);
        expect(response.status).toBe(400);
        expect(response.body).toEqual({
            message: "Course filter validation failed.",
            errors: [expect.stringContaining(field)]
        });
        expect(fake.getCourses).not.toHaveBeenCalled();
        expect(fake.countActiveEnrollmentsByCourse).not.toHaveBeenCalled();
    });
});

describe("public course availability in Costa Rica", () => {
    it.each([
        ["2026-11-20T05:59:59.999Z", true], // Nov 19, just before the last day begins.
        ["2026-11-21T05:59:59.999Z", true], // Nov 20, last instant in Costa Rica.
        ["2026-11-21T06:00:00.000Z", false] // Nov 21, local midnight.
    ])("uses the same closing date across public lists and options at %s", async (time, visible) => {
        vi.setSystemTime(new Date(time));
        const seasonal = course("seasonal-closed", {
            seasonName: "Navidad", schedule: { startDate: "2026-11-15", endDate: "2026-11-20", endTime: "10:00" }
        });
        fake.getCourses.mockResolvedValue([
            seasonal,
            course("single", { schedule: { startDate: "2026-11-20" } }),
            course("legacy", { schedule: { description: "Por confirmar" }, instructor: null, price: null }),
            course("unscheduled", { schedule: null, instructor: null, price: null })
        ]);
        fake.getCourseById.mockImplementation(async (id) => id === seasonal.id ? seasonal : null);

        await expectCatalogIds({}, visible ? [seasonal.id, "single", "legacy", "unscheduled"] : ["legacy", "unscheduled"]);
        const seasonalResponse = await request(app).get(`${catalog}/seasonal`);
        expect(seasonalResponse.status).toBe(200);
        expect(seasonalResponse.body.map(({ id }) => id)).toEqual(visible ? [seasonal.id] : []);
        const filterOptions = await request(app).get(options);
        expect(filterOptions.status).toBe(200);
        expect(filterOptions.body.instructors).toEqual(visible ? ["Ángela Núñez"] : []);

        // Published detail retains its historical status-only check.
        const detail = await request(app).get(`${catalog}/${seasonal.id}`);
        expect(detail.status).toBe(200);
        expect(detail.body).toEqual(toPublicCourse(seasonal));
    });
});

describe("GET /api/courses/filter-options", () => {
    it("returns unique instructors in Spanish order and a price range from the public catalog", async () => {
        const courses = [
            course("free", { instructor: "Zoe", price: 0, schedule: null }),
            course("seasonal", { instructor: "Ñora", price: 45000, seasonName: "Navidad" }),
            course("accented", { instructor: "  Ángela Núñez  " }),
            course("variant", { instructor: "ángela  nuñez" }),
            course("n", { instructor: "Nuria", price: null }),
            course("blank", { instructor: "  ", price: -1 }),
            course("legacy", { instructor: null, price: "999999" }),
            course("unsafe", { instructor: null, price: 9007199254740992 }),
            course("draft", { instructor: "Draft", price: 50000, status: COURSE_STATUS.DRAFT }),
            course("archived", { instructor: "Archived", price: 50000, status: COURSE_STATUS.ARCHIVED }),
            course("ended", { instructor: "Ended", price: 50000, schedule: { startDate: "2026-11-01" } })
        ];
        const expected = {
            instructors: ["Ángela Núñez", "Nuria", "Ñora", "Zoe"],
            priceRange: { min: 0, max: 45000 }
        };
        for (const entries of [courses, [...courses].reverse()]) {
            fake.getCourses.mockResolvedValue(entries);
            const response = await request(app).get(options);
            expect(response.status).toBe(200);
            expect(response.body).toEqual(expected);
        }
        expect(fake.getCourses.mock.calls).toEqual([[COURSE_STATUS.PUBLISHED], [COURSE_STATUS.PUBLISHED]]);
        expect(fake.getCourseById).not.toHaveBeenCalled();
        expect(fake.countActiveEnrollmentsByCourse).not.toHaveBeenCalled();
        expect(fake.verifyIdToken).not.toHaveBeenCalled();
    });

    it("returns an empty catalog and empty options without any courses", async () => {
        await expectCatalogIds({}, []);
        await expectCatalogIds({ q: "decoracion" }, []);
        const response = await request(app).get(options);
        expect(response.status).toBe(200);
        expect(response.body).toEqual({ instructors: [], priceRange: { min: null, max: null } });
    });

    it("keeps instructors even when no course has a valid price", async () => {
        fake.getCourses.mockResolvedValue([course("legacy", { price: null, schedule: null })]);
        const response = await request(app).get(options);
        expect(response.status).toBe(200);
        expect(response.body).toEqual({ instructors: ["Ángela Núñez"], priceRange: { min: null, max: null } });
    });

    it("returns a generic 500 when the repository fails", async () => {
        vi.spyOn(console, "error").mockImplementation(() => {});
        fake.getCourses.mockRejectedValue(new Error("Internal repository details"));
        const response = await request(app).get(options);
        expect(response.status).toBe(500);
        expect(response.body).toEqual({ message: "Could not retrieve course filter options." });
    });
});
