import {
    useEffect,
    useState
} from "react";

import {
    observeAuthState,
    signInAdmin,
    signOutAdmin,
    validateAdminSession
} from "../services/auth.service";
import { AUTH_EXPIRED_EVENT } from "../services/api";

import { AuthContext } from "./authContext";

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    // Mensaje para el login cuando la sesión se cerró sola (ej. token vencido)
    const [sessionMessage, setSessionMessage] = useState("");

    useEffect(() => {
        const unsubscribe = observeAuthState(
            async (firebaseUser) => {
                if (!firebaseUser) {
                    setUser(null);
                    setLoading(false);
                    return;
                }

                try {
                    const adminSession =
                        await validateAdminSession(firebaseUser);

                    if (adminSession) {
                        setUser(firebaseUser);
                    } else {
                        await signOutAdmin();
                        setUser(null);
                    }
                } catch (error) {
                    console.error(
                        "Session validation failed:",
                        error
                    );

                    setUser(null);
                } finally {
                    setLoading(false);
                }
            }
        );

        return unsubscribe;
    }, []);

    // Cierra la sesión si la API indica que el token ya no sirve o no hay permisos
    useEffect(() => {
        async function handleAuthExpired(event) {
            setSessionMessage(
                event.detail?.status === 403
                    ? "Su cuenta ya no tiene permisos de administración."
                    : "Su sesión expiró. Inicie sesión de nuevo."
            );

            try {
                await signOutAdmin();
            } finally {
                setUser(null);
            }
        }

        window.addEventListener(AUTH_EXPIRED_EVENT, handleAuthExpired);
        return () => window.removeEventListener(AUTH_EXPIRED_EVENT, handleAuthExpired);
    }, []);

    async function login(email, password) {
        const result =
            await signInAdmin(email, password);

        setUser(result.firebaseUser);
        setSessionMessage("");

        return result.firebaseUser;
    }

    async function logout() {
        await signOutAdmin();
        setUser(null);
    }

    const value = {
        user,
        loading,
        sessionMessage,
        login,
        logout
    };

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
}
