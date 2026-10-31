import { FieldValue } from "firebase-admin/firestore";
import { db } from "../config/firebase.js";
import { PRODUCT_STATUS } from "../models/product.model.js";

const PRODUCT_COLLECTION = "products";

// Maps a Firestore document snapshot to the product domain model.
export function mapProductDocument(documentSnapshot) {
    const data = documentSnapshot.data() ?? {};

    return {
        id: documentSnapshot.id,
        name: data.name,
        brand: data.brand ?? null,
        description: data.description ?? null,
        weight: data.weight ?? null,
        size: data.size ?? null,
        price: data.price,
        categoryId: data.categoryId,
        imageUrl: data.imageUrl ?? null,
        available: data.available !== false,
        status: data.status ?? PRODUCT_STATUS.PUBLISHED,
        createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : (typeof data.createdAt === "string" ? data.createdAt : new Date().toISOString()),
        updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate().toISOString() : (typeof data.updatedAt === "string" ? data.updatedAt : new Date().toISOString())
    };
}

// Retrieves all products with 'published' status from Firestore using a single-field query.
export async function getPublishedProducts() {
    const snapshot = await db
        .collection(PRODUCT_COLLECTION)
        .where("status", "==", PRODUCT_STATUS.PUBLISHED)
        .get();

    return snapshot.docs.map(mapProductDocument);
}

// Retrieves one product by document ID, or null when it does not exist (HU-T02).
export async function getProductById(id) {
    const snapshot = await db.collection(PRODUCT_COLLECTION).doc(id).get();
    return snapshot.exists ? mapProductDocument(snapshot) : null;
}

// Creates or updates a product document in Firestore.
export async function upsertProduct(product) {
    const { id, ...data } = product;
    const docRef = db.collection(PRODUCT_COLLECTION).doc(id);
    const existing = await docRef.get();

    const payload = {
        name: data.name,
        brand: data.brand ?? null,
        description: data.description ?? null,
        weight: data.weight ?? null,
        size: data.size ?? null,
        price: data.price,
        categoryId: data.categoryId,
        imageUrl: data.imageUrl ?? null,
        available: data.available !== false,
        status: data.status ?? PRODUCT_STATUS.PUBLISHED,
        updatedAt: FieldValue.serverTimestamp()
    };

    if (!existing.exists) {
        payload.createdAt = FieldValue.serverTimestamp();
    }

    await docRef.set(payload, { merge: true });
    const saved = await docRef.get();
    return mapProductDocument(saved);
}
