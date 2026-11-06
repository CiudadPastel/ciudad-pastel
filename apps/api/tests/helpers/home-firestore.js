// Minimal atomic Firestore double: transactions stage writes and serialize commits.
import { vi } from "vitest";
export const state = { docs: new Map(), failCommit: false, failTransaction: false };
let queue = Promise.resolve();
const snapshot = ref => ({ ref, id: ref.id, exists: state.docs.has(ref.path), data: () => structuredClone(state.docs.get(ref.path)) });
const collection = path => ({ path, doc: id => reference(`${path}/${id}`), get: async () => ({ docs: [...state.docs.keys()]
    .filter(key => key.startsWith(path + "/") && !key.slice(path.length + 1).includes("/"))
    .map(key => snapshot(reference(key))) }) });
function reference(path) {
    return { path, id: path.split("/").at(-1), collection: name => collection(`${path}/${name}`),
        get: async () => snapshot(reference(path)),
        set: async value => { if (state.failCommit) throw new Error("Firestore unavailable"); state.docs.set(path, structuredClone(value)); },
        update: async value => { if (state.failCommit) throw new Error("Firestore unavailable"); state.docs.set(path, { ...state.docs.get(path), ...structuredClone(value) }); } };
}
export const auth = { verifyIdToken: vi.fn() };
export const db = { collection: vi.fn(collection), runTransaction: fn => {
    const run = queue.then(async () => {
        const writes = [];
        const result = await fn({ get: ref => ref.get(), set: (ref, data) => writes.push(() => ref.set(data)),
            update: (ref, data) => writes.push(() => ref.update(data)) });
        if (state.failCommit || state.failTransaction) throw new Error("Firestore unavailable");
        for (const write of writes) await write();
        return result;
    });
    queue = run.catch(() => {});
    return run;
} };
export function resetStore() { state.docs.clear(); state.failCommit = false; state.failTransaction = false; auth.verifyIdToken.mockResolvedValue({ uid: "admin", admin: true }); }
