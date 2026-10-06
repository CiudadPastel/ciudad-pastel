import {
    Navigate,
    Outlet,
    useLocation
} from "react-router-dom";

import { useAuth } from "./AuthProvider";

function ProtectedRoute() {
    const {
        user,
        loading
    } = useAuth();

    const location = useLocation();

    if (loading) {
        return <p>Cargando sesión...</p>;
    }

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