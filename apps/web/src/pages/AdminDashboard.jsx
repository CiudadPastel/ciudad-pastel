import { BookOpen } from "lucide-react";
import { Link } from "react-router-dom";

import { useAuth } from "../auth/authContext";

function AdminDashboard() {
    const { user } = useAuth();

    return (
        <section style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <h1>Bienvenida</h1>

            <p>
                Sesión iniciada como <strong>{user?.email}</strong>.
            </p>

            <p>
                <Link to="/admin/cursos" className="btn btn-primary">
                    <BookOpen size={18} aria-hidden="true" />
                    Ir a cursos
                </Link>
            </p>
        </section>
    );
}

export default AdminDashboard;
