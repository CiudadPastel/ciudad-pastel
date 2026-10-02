import { useState } from "react";
import { signInAdmin } from "../services/auth.service";

function AdminLogin({ onLogin }) {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");

    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);

    async function handleSubmit(event) {
        event.preventDefault();

        setError("");
        setLoading(true);

        try {
            const result = await signInAdmin(email, password);

            onLogin(result.firebaseUser);
        } catch (error) {
            console.error(error);

            switch (error.code) {
                case "auth/invalid-credential":
                    setError("Contraseña o email invalidos.");
                    break;

                case "auth/invalid-email":
                    setError("Formato de email invalido.");
                    break;

                case "auth/too-many-requests":
                    setError(
                        "Muchos intentos fallidos. Intenta de nuevo luego."
                    );
                    break;

                default:
                    setError(
                        error.message || "No se pudo iniciar sesion."
                    );
            }
        } finally {
            setLoading(false);
        }
    }

    return (
        <main>
            <h1>Ciudad Pastel</h1>
            <h2>Administracion</h2>

            <form onSubmit={handleSubmit}>
                <div>
                    <label htmlFor="email">
                        Email
                    </label>

                    <input
                        id="email"
                        type="email"
                        value={email}
                        onChange={(event) =>
                            setEmail(event.target.value)
                        }
                        required
                    />
                </div>

                <div>
                    <label htmlFor="Contraseña">
                        Password
                    </label>

                    <input
                        id="password"
                        type="password"
                        value={password}
                        onChange={(event) =>
                            setPassword(event.target.value)
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
                    disabled={loading}
                >
                    {loading
                        ? "Signing in..."
                        : "Sign in"}
                </button>
            </form>
        </main>
    );
}

export default AdminLogin;