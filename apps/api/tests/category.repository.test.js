import { beforeEach, describe, expect, it, vi } from "vitest";

const fake = vi.hoisted(() => ({ get: vi.fn(), collection: vi.fn() }));
vi.mock("../src/config/firebase.js", () => ({ db: { collection: fake.collection } }));
vi.mock("firebase-admin/firestore", () => ({ FieldValue: { serverTimestamp: vi.fn() } }));
vi.mock("firebase-admin/app", () => {
    throw new Error("Real Firebase app access is forbidden.");
});

import { getCategories } from "../src/repositories/category.repository.js";

describe("category repository display ordering (CIU-149)", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        fake.collection.mockReturnValue({ get: fake.get });
    });

    it("orders by configured order before Spanish category name ties", async () => {
        const categories = [
            { id: "z", name: "Zanahoria", order: 2 },
            { id: "first", name: "Última alfabéticamente", order: 1 },
            { id: "c", name: "Chocolates", order: 2 },
            { id: "a", name: "Ázucar", order: 2 }
        ];
        fake.get.mockResolvedValue({ docs: categories.map(({ id, ...data }) => ({
            id, data: () => data
        })) });
        const result = await getCategories();
        expect(result.map((c) => c.id)).toEqual(["first", "a", "c", "z"]);
        expect(fake.collection).toHaveBeenCalledExactlyOnceWith("categories");
        expect(fake.get).toHaveBeenCalledTimes(1);
    });
});
