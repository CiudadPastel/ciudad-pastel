import { FieldValue } from "firebase-admin/firestore";

import { db } from "../config/firebase.js";

const COURSE_COLLECTION = "courses";


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

    return {
        id: createdCourse.id,
        ...createdCourse.data()
    };
}