import {
    applicationDefault,
    getApps,
    initializeApp
} from "firebase-admin/app";

import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";

const firebaseApp =
    getApps().length > 0
        ? getApps()[0]
        : initializeApp({
            credential: applicationDefault()
        });

const db = getFirestore(firebaseApp);
const auth = getAuth(firebaseApp);

export { db, auth };