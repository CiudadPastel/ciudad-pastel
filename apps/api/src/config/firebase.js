import dotenv from "dotenv";

import {
    applicationDefault,
    cert,
    getApps,
    initializeApp
} from "firebase-admin/app";

import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";

dotenv.config({
    path: new URL("../../.env", import.meta.url)
});

function resolveCredential() {
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
        try {
            const raw = process.env.FIREBASE_SERVICE_ACCOUNT.trim();
            const jsonString = raw.startsWith("{")
                ? raw
                : Buffer.from(raw, "base64").toString("utf8");
            return cert(JSON.parse(jsonString));
        } catch (error) {
            console.error("Error al analizar FIREBASE_SERVICE_ACCOUNT:", error.message);
        }
    }
    return applicationDefault();
}

const firebaseApp =
    getApps().length > 0
        ? getApps()[0]
        : initializeApp({
            credential: resolveCredential(),
            projectId: process.env.GOOGLE_CLOUD_PROJECT
        });

const db = getFirestore(firebaseApp);
const auth = getAuth(firebaseApp);

export { db, auth };