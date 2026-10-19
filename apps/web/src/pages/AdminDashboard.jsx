import { BookOpen, ClipboardList } from "lucide-react";
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

            <p style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem" }}>
                <Link to="/admin/cursos" className="btn btn-primary">
                    <BookOpen size={18} aria-hidden="true" />
                    Ir a cursos
                </Link>
                <Link to="/admin/solicitudes?estado=pendientes" className="btn btn-secondary">
                    <ClipboardList size={18} aria-hidden="true" />
                    Ver solicitudes pendientes
                </Link>
            </p>
        </section>
    );
}

export default AdminDashboard;
