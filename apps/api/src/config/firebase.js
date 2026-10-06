import dotenv from "dotenv";

import {
    applicationDefault,
    getApps,
    initializeApp
} from "firebase-admin/app";

import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";

dotenv.config({
    path: new URL("../../.env", import.meta.url)
});

const firebaseApp =
    getApps().length > 0
        ? getApps()[0]
        : initializeApp({
            credential: applicationDefault(),
            projectId: process.env.GOOGLE_CLOUD_PROJECT
        });

const db = getFirestore(firebaseApp);
const auth = getAuth(firebaseApp);

export { db, auth };