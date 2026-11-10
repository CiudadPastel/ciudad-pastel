import { BookMarked, BookOpen, CircleDollarSign, ShoppingBag, ShoppingCart } from "lucide-react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";

import { useCart } from "../../cart/useCart";
import styles from "./PublicLayout.module.css";

function PublicLayout() {
    const { units } = useCart();
    const location = useLocation();
    const navigate = useNavigate();
    const catalogFrom = location.pathname === "/tienda" ? location.pathname + location.search
        : typeof location.state?.from === "string" && location.state.from.startsWith("/tienda?") ? location.state.from : "/tienda";
    function openCart(event) {
        if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        const inCatalog = location.pathname === "/tienda";
        const visibleCard = inCatalog ? [...document.querySelectorAll("[data-product-id]")].find((card) => {
            const bounds = card.getBoundingClientRect();
            return bounds.top >= 0 && bounds.top < window.innerHeight;
        }) ?? null : null;
        let detailId = null;
        if (location.pathname.startsWith("/tienda/") && location.pathname !== "/tienda/carrito") {
            try { detailId = decodeURIComponent(location.pathname.slice("/tienda/".length)); }
            catch { /* An invalid deep link cannot supply a return product. */ }
        }
        navigate("/tienda/carrito", { state: { catalogFrom,
            catalogScrollY: inCatalog ? window.scrollY : null,
            catalogFocusProductId: visibleCard?.dataset?.productId || detailId } });
    }
    return (
        <div className={styles.shell}>
            <header className={styles.header}>
                <div className={styles.headerInner}>
                    <Link to="/" className={styles.brand}>
                        <span className={styles.brandName}>Ciudad Pastel</span>
                        <span className={styles.brandTag}>Academia de repostería</span>
                    </Link>
                    <nav aria-label="Navegación principal">
                        <Link to="/cursos" className="btn btn-secondary">
                            <BookOpen size={17} aria-hidden="true" />
                            Cursos
                        </Link>
                        <Link to="/tienda" className="btn btn-secondary">
                            <ShoppingBag size={17} aria-hidden="true" />
                            Tienda
                        </Link>
                        <Link to="/tienda/carrito" onClick={openCart} state={{ catalogFrom }} className="btn btn-secondary" aria-label={`Carrito: ${units} unidades`}>
                            <ShoppingCart size={17} aria-hidden="true" /> Carrito ({units})
                        </Link>
                        <Link to="/mis-libros-de-recetas" className="btn btn-secondary">
                            <BookMarked size={17} aria-hidden="true" />
                            Mis libros de recetas
                        </Link>
                        <Link to="/estado-de-pago" className="btn btn-secondary">
                            <CircleDollarSign size={17} aria-hidden="true" />
                            Estado de pago
                        </Link>
                    </nav>
                </div>
            </header>

            <main className={styles.main}>
                <Outlet />
            </main>

            <footer className={styles.footer}>
                <div className={styles.footerInner}>
                    <span>Ciudad Pastel</span>
                    <span>Academia de repostería</span>
                    <Link to="/equipo-desarrollo" className={styles.teamLink}>Equipo desarrollador</Link>
                </div>
            </footer>
        </div>
    );
}

export default PublicLayout;
