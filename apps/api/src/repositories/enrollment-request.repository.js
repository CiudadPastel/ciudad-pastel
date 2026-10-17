import { FieldValue } from "firebase-admin/firestore";
import { db } from "../config/firebase.js";

const COLLECTION = "enrollmentRequests";

// Maps a Firestore document snapshot to the EnrollmentRequest representation.
export function mapEnrollmentRequestDocument(documentSnapshot) {
    const data = documentSnapshot.data();

    return {
        id: documentSnapshot.id,
        courseId: data.courseId,
        courseName: data.courseName,
        fullName: data.fullName,
        email: data.email,
        phone: data.phone,
        message: data.message ?? null,
        status: data.status,
        createdAt: data.createdAt ? data.createdAt.toDate().toISOString() : new Date().toISOString(),
        updatedAt: data.updatedAt ? data.updatedAt.toDate().toISOString() : new Date().toISOString()
    };
}

// Stores a new enrollment request document in Firestore.
export async function createEnrollmentRequest(enrollmentRequest) {
    const { id, ...data } = enrollmentRequest;
    const docRef = db.collection(COLLECTION).doc(id);

    await docRef.set({
        ...data,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()
    });

    const created = await docRef.get();
    return mapEnrollmentRequestDocument(created);
}

// Retrieves an enrollment request record by its ID.
export async function getEnrollmentRequestById(id) {
    const doc = await db.collection(COLLECTION).doc(id).get();
    return doc.exists ? mapEnrollmentRequestDocument(doc) : null;
}

// Lists enrollment requests with optional single-field filters, sorted newest first in memory.
export async function getEnrollmentRequests(filter = {}) {
    let query = db.collection(COLLECTION);

    if (filter.courseId) {
        query = query.where("courseId", "==", filter.courseId);
    } else if (filter.status) {
        query = query.where("status", "==", filter.status);
    }

    const snapshot = await query.get();

    return snapshot.docs
        .map(mapEnrollmentRequestDocument)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
