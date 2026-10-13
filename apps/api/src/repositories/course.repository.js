import { FieldValue } from "firebase-admin/firestore";

import { db } from "../config/firebase.js";

const COURSE_COLLECTION = "courses";

// Maps Firestore data to the shared course response format.
function mapCourseDocument(documentSnapshot) {
    const courseData = documentSnapshot.data();

    return {
        ...courseData,
        // Courses created before HU-A02 do not have planning data yet.
        capacity: courseData.capacity ?? null,
        price: courseData.price ?? null,
        instructor: courseData.instructor ?? null,
        schedule: courseData.schedule ?? null,
        id: documentSnapshot.id,
        createdAt: courseData.createdAt.toDate().toISOString(),
        updatedAt: courseData.updatedAt.toDate().toISOString()
    };
}

// Reads all courses or filters them by status.
export async function getCourses(status) {
    let query = db.collection(COURSE_COLLECTION);

    if (status !== undefined) {
        query = query.where("status", "==", status);
    }

    const courses = await query.get();

    return courses.docs.map(mapCourseDocument);
}

// Reads a course using its Firestore document ID.
export async function getCourseById(id) {
    const course = await db
        .collection(COURSE_COLLECTION)
        .doc(id)
        .get();

    return course.exists ? mapCourseDocument(course) : null;
}


// Applies a status change after validating the current state atomically.
export async function updateCourseStatus(id, status, validateTransition) {
    const courseRef = db.collection(COURSE_COLLECTION).doc(id);

    const updated = await db.runTransaction(async (transaction) => {
        const course = await transaction.get(courseRef);

        if (!course.exists) {
            return false;
        }

        validateTransition(course.data().status, course.data());

        transaction.update(courseRef, {
            status,
            updatedAt: FieldValue.serverTimestamp()
        });

        return true;
    });

    if (!updated) {
        return null;
    }

    const updatedCourse = await courseRef.get();

    return updatedCourse.exists ? mapCourseDocument(updatedCourse) : null;
}

// Updates editable fields while preserving course metadata.
export async function updateCourse(id, courseData) {
    const courseRef = db
        .collection(COURSE_COLLECTION)
        .doc(id);

    const course = await courseRef.get();

    if (!course.exists) {
        return null;
    }

    try {
        await courseRef.update({
            name: courseData.name,
            summary: courseData.summary,
            description: courseData.description,
            imageUrl: courseData.imageUrl,
            learningOutcomes: courseData.learningOutcomes,
            requiredMaterials: courseData.requiredMaterials,
            capacity: courseData.capacity,
            price: courseData.price,
            instructor: courseData.instructor,
            schedule: courseData.schedule,
            updatedAt: FieldValue.serverTimestamp()
        });
    } catch (error) {
        // Handles a document deleted after the existence check.
        if (error.code === 5) {
            return null;
        }

        throw error;
    }

    const updatedCourse = await courseRef.get();

    return updatedCourse.exists ? mapCourseDocument(updatedCourse) : null;
}

// Creates a new course document in Firestore.
export async function createCourse(course) {
    const {
        id,
        ...courseData
    } = course;

    const courseRef = db
        .collection(COURSE_COLLECTION)
        .doc(id);

    await courseRef.set({
        ...courseData,

        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()
    });

    const createdCourse = await courseRef.get();

    return mapCourseDocument(createdCourse);
}
