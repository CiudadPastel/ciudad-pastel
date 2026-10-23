import { BookMarked, BookOpen, ShoppingBag } from "lucide-react";
import { Link, Outlet } from "react-router-dom";

import styles from "./PublicLayout.module.css";

function PublicLayout() {
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
                        <Link to="/mis-libros-de-recetas" className="btn btn-secondary">
                            <BookMarked size={17} aria-hidden="true" />
                            Mis libros de recetas
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
                </div>
            </footer>
        </div>
    );
}

export default PublicLayout;