import {
    Navigate,
    Outlet,
    useLocation
} from "react-router-dom";

import { LoaderCircle } from "lucide-react";

import { useAuth } from "./authContext";

const loadingStyle = {
    minHeight: "100svh",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: "0.75rem",
    color: "var(--cp-muted)"
};

function ProtectedRoute() {
    const {
        user,
        loading
    } = useAuth();

    const location = useLocation();

    if (loading) {
        return (
            <div style={loadingStyle} role="status">
                <LoaderCircle size={28} aria-hidden="true" />
                Verificando sesión…
            </div>
        );
    }

    // Todas las rutas /admin (incluidas las de cursos) pasan por aquí:
    // sin sesión de administración se redirige al login y luego se regresa.
    if (!user) {
        return (
            <Navigate
                to="/admin/login"
                replace
                state={{ from: location }}
            />
        );
    }

    return <Outlet />;
}

export default ProtectedRoute;