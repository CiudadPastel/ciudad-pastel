import { FieldValue } from "firebase-admin/firestore";

import { db } from "../config/firebase.js";

const COURSE_COLLECTION = "courses";

// Maps Firestore data to the shared course response format.
function mapCourseDocument(documentSnapshot) {
    const courseData = documentSnapshot.data();

    return {
        ...courseData,
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
