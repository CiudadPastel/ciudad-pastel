import { useState } from "react";
import {
    Navigate,
    useLocation,
    useNavigate
} from "react-router-dom";

import { useAuth } from "../auth/AuthProvider";

function AdminLogin() {
    const [email, setEmail] = useState("");
    const [password, setPassword] =
        useState("");

    const [error, setError] = useState("");
    const [submitting, setSubmitting] =
        useState(false);

    const {
        user,
        loading,
        login
    } = useAuth();

    const navigate = useNavigate();
    const location = useLocation();

    async function handleSubmit(event) {
        event.preventDefault();

        setError("");
        setSubmitting(true);

        try {
            await login(email, password);

            const destination =
                location.state?.from?.pathname
                || "/admin";

            navigate(destination, {
                replace: true
            });
        } catch (error) {
            console.error(error);

            switch (error.code) {
                case "auth/invalid-credential":
                    setError(
                        "Correo o contraseña incorrectos."
                    );
                    break;

                case "auth/invalid-email":
                    setError(
                        "El correo no tiene un formato válido."
                    );
                    break;

                case "auth/too-many-requests":
                    setError(
                        "Demasiados intentos. Intenta nuevamente más tarde."
                    );
                    break;

                default:
                    setError(
                        error.message
                        || "No se pudo iniciar sesión."
                    );
            }
        } finally {
            setSubmitting(false);
        }
    }

    if (loading) {
        return <p>Cargando...</p>;
    }

    if (user) {
        return (
            <Navigate
                to="/admin"
                replace
            />
        );
    }

    return (
        <main>
            <h1>Ciudad Pastel</h1>

            <h2>Administración</h2>

            <form onSubmit={handleSubmit}>
                <div>
                    <label htmlFor="email">
                        Correo electrónico
                    </label>

                    <input
                        id="email"
                        type="email"
                        value={email}
                        onChange={(event) =>
                            setEmail(
                                event.target.value
                            )
                        }
                        required
                    />
                </div>

                <div>
                    <label htmlFor="password">
                        Contraseña
                    </label>

                    <input
                        id="password"
                        type="password"
                        value={password}
                        onChange={(event) =>
                            setPassword(
                                event.target.value
                            )
                        }
                        required
                    />
                </div>

                {error && (
                    <p role="alert">
                        {error}
                    </p>
                )}

                <button
                    type="submit"
                    disabled={submitting}
                >
                    {submitting
                        ? "Ingresando..."
                        : "Iniciar sesión"}
                </button>
            </form>
        </main>
    );
}

export default AdminLogin;