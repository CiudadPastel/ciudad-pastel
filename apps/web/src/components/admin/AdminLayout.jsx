import { BookOpen, ClipboardList, LayoutDashboard, LogOut, Package, Image } from "lucide-react";
import { useEffect, useRef } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";

import { useAuth } from "../../auth/authContext";

import styles from "./AdminLayout.module.css";

/*
 * Para agregar secciones (Productos, Matrículas...) basta con
 * sumar una entrada a este arreglo y su ruta en App.jsx.
 */
const NAV_ITEMS = [
    { to: "/admin", label: "Inicio", icon: LayoutDashboard, end: true },
    { to: "/admin/pagina-inicio", label: "Página de inicio", icon: Image },
    { to: "/admin/cursos", label: "Cursos", icon: BookOpen },
    { to: "/admin/productos", label: "Productos", icon: Package },
    { to: "/admin/solicitudes", label: "Solicitudes", icon: ClipboardList }
];

function AdminLayout() {
    const { user, logout } = useAuth();
    const navigate = useNavigate();
    const { pathname } = useLocation();
    const navRef = useRef(null);

    // En el celular el menú se desliza de lado: se deja a la vista la sección abierta
    useEffect(() => {
        const nav = navRef.current;
        const active = nav?.querySelector('[aria-current="page"]');
        if (!nav || !active || nav.scrollWidth <= nav.clientWidth) return;
        nav.scrollTo({ left: active.offsetLeft - (nav.clientWidth - active.offsetWidth) / 2 });
    }, [pathname]);

    async function handleLogout() {
        await logout();
        navigate("/");
    }

    return (
        <div className={styles.shell}>
            <aside className={styles.sidebar}>
                <div className={styles.brand}>
                    <span className={styles.brandName}>ciudad</span>
                    <span className={styles.brandSub}>pastel</span>
                    <span className={styles.brandTag}>Administración</span>
                </div>

                <nav ref={navRef} aria-label="Administración" className={styles.nav}>
                    {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
                        <NavLink
                            key={to}
                            to={to}
                            end={end}
                            className={({ isActive }) =>
                                `${styles.navLink} ${isActive ? styles.active : ""}`
                            }
                        >
                            <Icon size={18} aria-hidden="true" />
                            {label}
                        </NavLink>
                    ))}
                </nav>

                <div className={styles.account}>
                    <span className={styles.email} title={user?.email}>
                        {user?.email}
                    </span>
                    <button
                        type="button"
                        className={styles.logout}
                        onClick={handleLogout}
                    >
                        <LogOut size={16} aria-hidden="true" />
                        Cerrar sesión
                    </button>
                </div>
            </aside>

            <main className={styles.content}>
                <Outlet />
            </main>
        </div>
    );
}

export default AdminLayout;
