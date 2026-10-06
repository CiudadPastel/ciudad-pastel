import { useState } from "react";
import {
    ArrowLeft,
    CircleAlert,
    Eye,
    EyeOff,
    LoaderCircle,
    Lock,
    LogIn,
    Mail
} from "lucide-react";
import {
    Link,
    Navigate,
    useLocation,
    useNavigate
} from "react-router-dom";

import { useAuth } from "../auth/AuthProvider";
import logo from "../assets/logo-ciudad-pastel-blanco.png";

import styles from "./AdminLogin.module.css";

function AdminLogin() {
    const [email, setEmail] = useState("");
    const [password, setPassword] =
        useState("");
    const [showPassword, setShowPassword] =
        useState(false);

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

                case "auth/network-request-failed":
                    setError(
                        "No hay conexión a internet. Revise su conexión e intente de nuevo."
                    );
                    break;

                case "auth/too-many-requests":
                    setError(
                        "Demasiados intentos. Intente nuevamente más tarde."
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
        return (
            <div className={styles.loading} role="status">
                <LoaderCircle size={28} className={styles.spin} aria-hidden="true" />
                Cargando…
            </div>
        );
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
        <main className={styles.page}>
            <section className={styles.brand} aria-hidden="true">
                <img src={logo} alt="" className={styles.logo} />
                <p className={styles.tagline}>
                    Tienda de insumos y Academia de Pastelería
                </p>
            </section>

            <section className={styles.panel}>
                <div className={styles.card}>
                    <img src={logo} alt="" className={styles.logoMobile} aria-hidden="true" />

                    <header className={styles.header}>
                        <h1>Administración</h1>
                        <p>Ingrese con su cuenta autorizada de Ciudad Pastel.</p>
                    </header>

                    <form onSubmit={handleSubmit} className={styles.form}>
                        <div className={styles.field}>
                            <label htmlFor="email">
                                Correo electrónico
                            </label>

                            <div className={styles.inputWrap}>
                                <Mail size={18} aria-hidden="true" className={styles.inputIcon} />
                                <input
                                    id="email"
                                    type="email"
                                    autoComplete="email"
                                    placeholder="nombre@correo.com"
                                    value={email}
                                    onChange={(event) =>
                                        setEmail(
                                            event.target.value
                                        )
                                    }
                                    aria-invalid={Boolean(error)}
                                    required
                                />
                            </div>
                        </div>

                        <div className={styles.field}>
                            <label htmlFor="password">
                                Contraseña
                            </label>

                            <div className={styles.inputWrap}>
                                <Lock size={18} aria-hidden="true" className={styles.inputIcon} />
                                <input
                                    id="password"
                                    type={showPassword ? "text" : "password"}
                                    autoComplete="current-password"
                                    value={password}
                                    onChange={(event) =>
                                        setPassword(
                                            event.target.value
                                        )
                                    }
                                    aria-invalid={Boolean(error)}
                                    required
                                />
                                <button
                                    type="button"
                                    className={styles.toggle}
                                    onClick={() => setShowPassword((v) => !v)}
                                    aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                                    title={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                                >
                                    {showPassword
                                        ? <EyeOff size={18} aria-hidden="true" />
                                        : <Eye size={18} aria-hidden="true" />}
                                </button>
                            </div>
                        </div>

                        {error && (
                            <p role="alert" className={styles.error}>
                                <CircleAlert size={18} aria-hidden="true" />
                                {error}
                            </p>
                        )}

                        <button
                            type="submit"
                            className={`btn btn-primary ${styles.submit}`}
                            disabled={submitting}
                        >
                            {submitting
                                ? <LoaderCircle size={18} className={styles.spin} aria-hidden="true" />
                                : <LogIn size={18} aria-hidden="true" />}
                            {submitting
                                ? "Ingresando..."
                                : "Iniciar sesión"}
                        </button>
                    </form>

                    <Link to="/" className={styles.back}>
                        <ArrowLeft size={16} aria-hidden="true" />
                        Volver al sitio
                    </Link>
                </div>
            </section>
        </main>
    );
}

export default AdminLogin;
