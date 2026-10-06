import {
    createContext,
    useContext,
    useEffect,
    useState
} from "react";

import {
    observeAuthState,
    signInAdmin,
    signOutAdmin,
    validateAdminSession
} from "../services/auth.service";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

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

    async function login(email, password) {
        const result =
            await signInAdmin(email, password);

        setUser(result.firebaseUser);

        return result.firebaseUser;
    }

    async function logout() {
        await signOutAdmin();
        setUser(null);
    }

    const value = {
        user,
        loading,
        login,
        logout
    };

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    return useContext(AuthContext);
}