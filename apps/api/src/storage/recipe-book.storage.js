import { db } from "../config/firebase.js";

const COLLECTION = "recipeBooks";
const CHUNKS = "chunks";
const CHUNK_SIZE = 800_000; // bytes; a Firestore document is limited to about 1 MiB
const WRITE_BATCH_CHUNKS = 4;
const DELETE_BATCH_SIZE = 400;

// Returns the chunks subcollection of a recipe book file.
function chunksRef(recipeBookId) {
    return db.collection(COLLECTION).doc(recipeBookId).collection(CHUNKS);
}

// Stores a file as ordered chunks. The metadata document is written afterwards by the caller.
export async function saveRecipeBookFile(recipeBookId, buffer) {
    const ref = chunksRef(recipeBookId);
    const total = Math.ceil(buffer.length / CHUNK_SIZE);

    try {
        for (let first = 0; first < total; first += WRITE_BATCH_CHUNKS) {
            const batch = db.batch();
            const last = Math.min(first + WRITE_BATCH_CHUNKS, total);

            for (let index = first; index < last; index += 1) {
                batch.set(ref.doc(String(index).padStart(4, "0")), {
                    index,
                    data: buffer.subarray(index * CHUNK_SIZE, (index + 1) * CHUNK_SIZE)
                });
            }

            await batch.commit();
        }
    } catch (error) {
        await deleteRecipeBookFile(recipeBookId).catch(() => {});
        throw error;
    }
}

// Returns the whole file as a Buffer, or null when no chunks are stored.
export async function readRecipeBookFile(recipeBookId) {
    const snapshot = await chunksRef(recipeBookId).orderBy("index").get();

    if (snapshot.empty) {
        return null;
    }

    return Buffer.concat(snapshot.docs.map((doc) => Buffer.from(doc.data().data)));
}

// Removes every chunk of a file. Safe to call when nothing is stored.
export async function deleteRecipeBookFile(recipeBookId) {
    const snapshot = await chunksRef(recipeBookId).get();

    for (let first = 0; first < snapshot.docs.length; first += DELETE_BATCH_SIZE) {
        const batch = db.batch();

        snapshot.docs
            .slice(first, first + DELETE_BATCH_SIZE)
            .forEach((doc) => batch.delete(doc.ref));

        await batch.commit();
    }
}
