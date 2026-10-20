import { FieldValue } from "firebase-admin/firestore";
import { db } from "../config/firebase.js";

import { ENROLLMENT_STATUS } from "../models/enrollment.model.js";

const COLLECTION = "enrollments";
const COURSES = "courses";
const REQUESTS = "enrollmentRequests";

function toIso(timestamp) {
    return timestamp ? timestamp.toDate().toISOString() : null;
}

// Maps a Firestore document snapshot to the Enrollment representation.
export function mapEnrollmentDocument(documentSnapshot) {
    const data = documentSnapshot.data();

    return {
        id: documentSnapshot.id,
        courseId: data.courseId,
        courseName: data.courseName,
        fullName: data.fullName,
        idType: data.idType ?? null,
        idNumber: data.idNumber,
        phone: data.phone,
        enrollmentRequestId: data.enrollmentRequestId ?? null,
        note: data.note ?? null,
        status: data.status,
        confirmedAt: toIso(data.confirmedAt),
        cancelledAt: toIso(data.cancelledAt),
        createdAt: toIso(data.createdAt),
        updatedAt: toIso(data.updatedAt)
    };
}

function mapCourse(snapshot) {
    return snapshot.exists ? { id: snapshot.id, ...snapshot.data() } : null;
}

function mapRequest(snapshot) {
    return snapshot.exists ? { id: snapshot.id, ...snapshot.data() } : null;
}

/**
 * Creates an enrollment inside a transaction, so two administrators cannot
 * overfill a course or enroll the same person twice at the same time.
 *   validate({ course, enrollments, request, requests }) runs inside the
 *   transaction and throws to cancel. "request" is the one being confirmed (or
 *   null) and "requests" are all the requests of the course. It returns the
 *   request to mark as confirmed, if any.
 */
export async function createEnrollment(enrollment, { validate, enrollmentRequestId = null }) {
    const { id, ...data } = enrollment;
    const enrollmentRef = db.collection(COLLECTION).doc(id);
    const courseRef = db.collection(COURSES).doc(enrollment.courseId);
    const courseEnrollments = db.collection(COLLECTION).where("courseId", "==", enrollment.courseId);
    const requestRef = enrollmentRequestId ? db.collection(REQUESTS).doc(enrollmentRequestId) : null;
    const courseRequests = db.collection(REQUESTS).where("courseId", "==", enrollment.courseId);

    await db.runTransaction(async (transaction) => {
        // Firestore requires every read before the first write.
        const course = mapCourse(await transaction.get(courseRef));
        const enrollments = (await transaction.get(courseEnrollments)).docs.map(mapEnrollmentDocument);
        const request = requestRef ? mapRequest(await transaction.get(requestRef)) : null;
        const requests = (await transaction.get(courseRequests)).docs.map(mapRequest);

        const requestToConfirm = validate({ course, enrollments, request, requests });

        transaction.set(enrollmentRef, {
            ...data,
            enrollmentRequestId: requestToConfirm?.id ?? data.enrollmentRequestId ?? null,
            confirmedAt: FieldValue.serverTimestamp(),
            cancelledAt: null,
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp()
        });

        // The request is marked so it is not processed twice.
        if (requestToConfirm) {
            transaction.update(db.collection(REQUESTS).doc(requestToConfirm.id), {
                status: "confirmed",
                enrollmentId: id,
                updatedAt: FieldValue.serverTimestamp()
            });
        }
    });

    return getEnrollmentById(id);
}

export async function getEnrollmentById(id) {
    const doc = await db.collection(COLLECTION).doc(id).get();
    return doc.exists ? mapEnrollmentDocument(doc) : null;
}

// All the enrollments of one course (any status).
export async function getEnrollmentsByCourse(courseId) {
    const snapshot = await db.collection(COLLECTION).where("courseId", "==", courseId).get();

    return snapshot.docs.map(mapEnrollmentDocument);
}

/**
 * Updates an enrollment inside a transaction.
 *   buildChanges({ enrollment, course, enrollments }) validates and returns
 *   the fields to save; it throws to cancel. Returns null if it does not exist.
 */
export async function updateEnrollment(id, buildChanges) {
    const enrollmentRef = db.collection(COLLECTION).doc(id);
    let found = true;

    await db.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(enrollmentRef);
        if (!snapshot.exists) {
            found = false;
            return;
        }

        const enrollment = mapEnrollmentDocument(snapshot);
        const course = mapCourse(await transaction.get(db.collection(COURSES).doc(enrollment.courseId)));
        const enrollments = (await transaction.get(
            db.collection(COLLECTION).where("courseId", "==", enrollment.courseId)
        )).docs.map(mapEnrollmentDocument);

        const changes = buildChanges({ enrollment, course, enrollments });

        const update = { ...changes, updatedAt: FieldValue.serverTimestamp() };
        if (changes.status === ENROLLMENT_STATUS.CANCELLED && enrollment.status !== ENROLLMENT_STATUS.CANCELLED) {
            update.cancelledAt = FieldValue.serverTimestamp();
        }
        if (changes.status === ENROLLMENT_STATUS.ENROLLED && enrollment.status !== ENROLLMENT_STATUS.ENROLLED) {
            update.cancelledAt = null;
        }

        transaction.update(enrollmentRef, update);
    });

    return found ? getEnrollmentById(id) : null;
}

// Active enrollments per course, for the remaining spots: Map(courseId -> count).
export async function countActiveEnrollmentsByCourse() {
    const snapshot = await db.collection(COLLECTION).where("status", "==", ENROLLMENT_STATUS.ENROLLED).get();
    const counts = new Map();

    for (const doc of snapshot.docs) {
        const { courseId } = doc.data();
        counts.set(courseId, (counts.get(courseId) ?? 0) + 1);
    }

    return counts;
}

// Active enrollments of a person (by ID number), in any course.
export async function getActiveEnrollmentsByIdNumber(idNumber) {
    const snapshot = await db.collection(COLLECTION).where("idNumber", "==", idNumber).get();

    return snapshot.docs
        .map(mapEnrollmentDocument)
        .filter((enrollment) => enrollment.status === ENROLLMENT_STATUS.ENROLLED);
}
