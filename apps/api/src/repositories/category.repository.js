import { FieldValue } from "firebase-admin/firestore";
import { db } from "../config/firebase.js";

const CATEGORY_COLLECTION = "categories";

// Maps a Firestore document snapshot to the category domain model.
export function mapCategoryDocument(documentSnapshot) {
    const data = documentSnapshot.data() ?? {};

    return {
        id: documentSnapshot.id,
        name: data.name,
        order: typeof data.order === "number" ? data.order : 0,
        createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : (typeof data.createdAt === "string" ? data.createdAt : new Date().toISOString()),
        updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate().toISOString() : (typeof data.updatedAt === "string" ? data.updatedAt : new Date().toISOString())
    };
}

// Retrieves all categories from Firestore sorted in memory by display order.
export async function getCategories() {
    const snapshot = await db.collection(CATEGORY_COLLECTION).get();

    return snapshot.docs
        .map(mapCategoryDocument)
        .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name, "es"));
}

// Creates or updates a category document in Firestore.
export async function upsertCategory(category) {
    const { id, ...data } = category;
    const docRef = db.collection(CATEGORY_COLLECTION).doc(id);
    const existing = await docRef.get();

    const payload = {
        name: data.name,
        order: typeof data.order === "number" ? data.order : 0,
        updatedAt: FieldValue.serverTimestamp()
    };

    if (!existing.exists) {
        payload.createdAt = FieldValue.serverTimestamp();
    }

    await docRef.set(payload, { merge: true });
    const saved = await docRef.get();
    return mapCategoryDocument(saved);
}
