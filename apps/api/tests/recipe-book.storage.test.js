import { beforeEach, describe, expect, it, vi } from "vitest";

const { store, flags, fakeDb } = vi.hoisted(() => {
    const memoryStore = new Map();
    const testFlags = { shouldFailBatch: false };

    const db = {
        collection(collectionName) {
            return {
                doc(docId) {
                    return {
                        collection(subcollectionName) {
                            const subKeyPrefix = `${collectionName}/${docId}/${subcollectionName}/`;

                            return {
                                doc(chunkDocId) {
                                    const key = `${subKeyPrefix}${chunkDocId}`;
                                    return {
                                        ref: { key },
                                        set(data) {
                                            memoryStore.set(key, data);
                                            return Promise.resolve();
                                        }
                                    };
                                },
                                orderBy(field) {
                                    return {
                                        get() {
                                            const docs = Array.from(memoryStore.entries())
                                                .filter(([k]) => k.startsWith(subKeyPrefix))
                                                .map(([key, value]) => ({
                                                    ref: { key },
                                                    data: () => value
                                                }))
                                                .sort((a, b) => a.data()[field] - b.data()[field]);

                                            return Promise.resolve({
                                                empty: docs.length === 0,
                                                docs
                                            });
                                        }
                                    };
                                },
                                get() {
                                    const docs = Array.from(memoryStore.entries())
                                        .filter(([k]) => k.startsWith(subKeyPrefix))
                                        .map(([key, value]) => ({
                                            ref: { key },
                                            data: () => value
                                        }));

                                    return Promise.resolve({
                                        empty: docs.length === 0,
                                        docs
                                    });
                                }
                            };
                        }
                    };
                }
            };
        },
        batch() {
            const operations = [];

            return {
                set(docRef, data) {
                    operations.push(() => memoryStore.set(docRef.ref.key, data));
                },
                delete(docRef) {
                    operations.push(() => memoryStore.delete(docRef.key));
                },
                commit() {
                    if (testFlags.shouldFailBatch) {
                        return Promise.reject(new Error("Simulated Firestore batch failure"));
                    }
                    operations.forEach((op) => op());
                    return Promise.resolve();
                }
            };
        }
    };

    return { store: memoryStore, flags: testFlags, fakeDb: db };
});

vi.mock("dotenv", () => ({ default: { config: vi.fn() } }));
vi.mock("firebase-admin/app", () => {
    throw new Error("Real Firebase app access is forbidden.");
});
vi.mock("../src/config/firebase.js", () => ({
    db: fakeDb
}));

import {
    deleteRecipeBookFile,
    readRecipeBookFile,
    saveRecipeBookFile
} from "../src/storage/recipe-book.storage.js";

describe("recipe-book.storage", () => {
    beforeEach(() => {
        store.clear();
        flags.shouldFailBatch = false;
    });

    it("saves and reads a 2 MB buffer reconstructing identical bytes", async () => {
        const recipeBookId = "test-2mb-book";
        const buffer = Buffer.alloc(2 * 1024 * 1024);
        for (let i = 0; i < buffer.length; i += 1) {
            buffer[i] = i % 256;
        }

        await saveRecipeBookFile(recipeBookId, buffer);
        const retrieved = await readRecipeBookFile(recipeBookId);

        expect(retrieved).not.toBeNull();
        expect(retrieved.length).toBe(buffer.length);
        expect(Buffer.compare(retrieved, buffer)).toBe(0);
    });

    it("saves and reads a single-byte buffer", async () => {
        const recipeBookId = "test-1b-book";
        const buffer = Buffer.from([42]);

        await saveRecipeBookFile(recipeBookId, buffer);
        const retrieved = await readRecipeBookFile(recipeBookId);

        expect(retrieved).not.toBeNull();
        expect(retrieved.length).toBe(1);
        expect(retrieved[0]).toBe(42);
    });

    it("returns null when reading a nonexistent recipe book file", async () => {
        const retrieved = await readRecipeBookFile("nonexistent-book-id");
        expect(retrieved).toBeNull();
    });

    it("deletes a stored file so subsequent read returns null", async () => {
        const recipeBookId = "test-delete-book";
        const buffer = Buffer.from("PDF payload simulation");

        await saveRecipeBookFile(recipeBookId, buffer);
        expect(await readRecipeBookFile(recipeBookId)).not.toBeNull();

        await deleteRecipeBookFile(recipeBookId);
        expect(await readRecipeBookFile(recipeBookId)).toBeNull();
    });

    it("does not fail when deleting a file that has no stored chunks", async () => {
        await expect(deleteRecipeBookFile("empty-or-missing-book")).resolves.toBeUndefined();
    });

    it("cleans up written chunks when save fails midway", async () => {
        const recipeBookId = "test-failed-save-book";
        const buffer = Buffer.alloc(2 * 1024 * 1024); // Multiple chunks (> 800 KB)

        flags.shouldFailBatch = true;

        await expect(saveRecipeBookFile(recipeBookId, buffer)).rejects.toThrow("Simulated Firestore batch failure");

        // The catch block invokes deleteRecipeBookFile; no chunks should remain
        flags.shouldFailBatch = false;
        const retrieved = await readRecipeBookFile(recipeBookId);
        expect(retrieved).toBeNull();
    });
});
