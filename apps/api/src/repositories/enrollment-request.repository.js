import { FieldValue } from "firebase-admin/firestore";
import { db } from "../config/firebase.js";

const COLLECTION = "enrollmentRequests";

function toIso(timestamp) {
    return timestamp ? timestamp.toDate().toISOString() : null;
}

// Maps a Firestore document snapshot to the EnrollmentRequest representation.
export function mapEnrollmentRequestDocument(documentSnapshot) {
    const data = documentSnapshot.data();

    return {
        id: documentSnapshot.id,
        courseId: data.courseId,
        courseName: data.courseName,
        fullName: data.fullName,
        idType: data.idType ?? null,
        idNumber: data.idNumber ?? null,
        phone: data.phone,
        status: data.status,
        // Enrollment created when the request was confirmed (HU-A09)
        enrollmentId: data.enrollmentId ?? null,
        createdAt: toIso(data.createdAt),
        updatedAt: toIso(data.updatedAt)
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

// Lists enrollment requests, newest first. Firestore filters by one field
// (no composite index needed) and the second filter is applied in memory.
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
        .filter((request) => !filter.status || request.status === filter.status)
        .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
}

// Finds the requests a person (by ID number) already made for one course.
export async function getEnrollmentRequestsForPerson(courseId, idNumber) {
    const snapshot = await db
        .collection(COLLECTION)
        .where("courseId", "==", courseId)
        .get();

    return snapshot.docs
        .map(mapEnrollmentRequestDocument)
        .filter((request) => request.idNumber === idNumber);
}

// Changes the follow-up status of a request. Returns null if it does not exist.
export async function updateEnrollmentRequestStatus(id, status) {
    const docRef = db.collection(COLLECTION).doc(id);
    const current = await docRef.get();

    if (!current.exists) {
        return null;
    }

    await docRef.update({
        status,
        updatedAt: FieldValue.serverTimestamp()
    });

    const updated = await docRef.get();
    return mapEnrollmentRequestDocument(updated);
}
