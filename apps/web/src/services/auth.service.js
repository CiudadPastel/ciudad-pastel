import {
    onAuthStateChanged,
    signInWithEmailAndPassword,
    signOut
} from "firebase/auth";

import { auth } from "../config/firebase";

const API_URL =
    import.meta.env.VITE_API_URL || "http://localhost:3000/api";

export async function signInAdmin(email, password) {
    const credential = await signInWithEmailAndPassword(
        auth,
        email,
        password
    );

    // Fuerza un token actualizado para incluir custom claims como admin:true
    const token = await credential.user.getIdToken(true);

    const response = await fetch(`${API_URL}/admin/health`, {
        headers: {
            Authorization: `Bearer ${token}`
        }
    });

    if (!response.ok) {
        await signOut(auth);

        if (response.status === 403) {
            throw new Error(
                "Esta cuenta no tiene privilegios administrativos."
            );
        }

        throw new Error(
            "No se pudo validar el acceso."
        );
    }

    const data = await response.json();

    return {
        firebaseUser: credential.user,
        backendData: data
    };
}

export async function signOutAdmin() {
    await signOut(auth);
}

export function observeAuthState(callback) {
    return onAuthStateChanged(auth, callback);
}

export async function validateAdminSession(user) {
    if (!user) {
        return null;
    }

    const token = await user.getIdToken();

    const response = await fetch(`${API_URL}/admin/health`, {
        headers: {
            Authorization: `Bearer ${token}`
        }
    });

    if (!response.ok) {
        return null;
    }

    return response.json();
}