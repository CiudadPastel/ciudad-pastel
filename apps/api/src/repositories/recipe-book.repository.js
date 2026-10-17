import { FieldValue } from "firebase-admin/firestore";
import { db } from "../config/firebase.js";

const COLLECTION = "recipeBooks";

// Maps a Firestore document snapshot to the public API RecipeBook representation.
export function mapRecipeBookDocument(documentSnapshot) {
    const data = documentSnapshot.data();

    return {
        id: documentSnapshot.id,
        courseId: data.courseId,
        title: data.title,
        fileName: data.fileName,
        contentType: data.contentType ?? "application/pdf",
        sizeBytes: data.sizeBytes,
        createdAt: data.createdAt ? data.createdAt.toDate().toISOString() : new Date().toISOString(),
        updatedAt: data.updatedAt ? data.updatedAt.toDate().toISOString() : new Date().toISOString()
    };
}

// Stores a new recipe book metadata document in Firestore.
export async function createRecipeBook(recipeBook) {
    const { id, ...data } = recipeBook;
    const docRef = db.collection(COLLECTION).doc(id);

    await docRef.set({
        ...data,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()
    });

    const created = await docRef.get();
    return mapRecipeBookDocument(created);
}

// Retrieves a recipe book metadata record by its ID.
export async function getRecipeBookById(id) {
    const doc = await db.collection(COLLECTION).doc(id).get();
    return doc.exists ? mapRecipeBookDocument(doc) : null;
}

// Lists all recipe books associated with a given course, sorted newest first in memory.
export async function getRecipeBooksByCourseId(courseId) {
    const snapshot = await db
        .collection(COLLECTION)
        .where("courseId", "==", courseId)
        .get();

    return snapshot.docs
        .map(mapRecipeBookDocument)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

// Counts the number of recipe books linked to a specific course.
export async function countRecipeBooksByCourseId(courseId) {
    const snapshot = await db
        .collection(COLLECTION)
        .where("courseId", "==", courseId)
        .get();

    return snapshot.size;
}

// Deletes a recipe book metadata document.
export async function deleteRecipeBook(id) {
    const docRef = db.collection(COLLECTION).doc(id);
    const existing = await docRef.get();

    if (!existing.exists) {
        return false;
    }

    await docRef.delete();
    return true;
}
