import { useNavigate } from "react-router-dom";

import { useAuth } from "../auth/AuthProvider";

function AdminDashboard() {
    const {
        user,
        logout
    } = useAuth();

    const navigate = useNavigate();

    async function handleLogout() {
        await logout();

        navigate("/");
    }

    return (
        <main>
            <h1>
                Administración Ciudad Pastel
            </h1>

            <p>
                Sesión iniciada como{" "}
                <strong>
                    {user?.email}
                </strong>
            </p>

            <button onClick={handleLogout}>
                Cerrar sesión
            </button>
        </main>
    );
}

export default AdminDashboard;