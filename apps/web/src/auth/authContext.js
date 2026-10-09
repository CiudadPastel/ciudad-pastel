import { createContext, useContext } from "react";

/*
 * Contexto de sesión de administración.
 * Está separado de AuthProvider.jsx para que ese archivo solo exporte
 * componentes (regla react-refresh/only-export-components de ESLint).
 */
export const AuthContext = createContext(null);

/** Datos de la sesión: { user, loading, sessionMessage, login, logout }. */
export function useAuth() {
    return useContext(AuthContext);
}
