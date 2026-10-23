import { GraduationCap, MessageCircle, ShoppingBag } from "lucide-react";
import { Link } from "react-router-dom";

import { CIUDAD_PASTEL_WHATSAPP, formatPhone, whatsappLink } from "../constants/enrollment";
import logo from "../assets/logo-ciudad-pastel.png";

import styles from "./Home.module.css";

/*
 * Página de inicio pública. Es para clientes: elegir entre la Academia
 * (azul marino) y la Tienda (verde menta), los dos colores de la marca.
 * El acceso de administración queda como enlace discreto al pie.
 */
function Home() {
    return (
        <div className={styles.page}>
            <main className={styles.main}>
                <header className={styles.brand}>
                    <img src={logo} alt="Ciudad Pastel" className={styles.logo} />
                    <p className={styles.tagline}>Insumos de repostería y academia de pastelería</p>
                </header>

                <nav className={styles.doors} aria-label="¿Qué estás buscando?">
                    <Link to="/cursos" className={`${styles.door} ${styles.academy}`}>
                        <GraduationCap size={34} aria-hidden="true" className={styles.doorIcon} />
                        <h2>Academia</h2>
                        <p>Cursos y talleres de repostería, de un día o de varias semanas.</p>
                        <span className={styles.doorAction}>Ver cursos</span>
                    </Link>

                    <Link to="/tienda" className={`${styles.door} ${styles.store}`}>
                        <ShoppingBag size={34} aria-hidden="true" className={styles.doorIcon} />
                        <h2>Tienda</h2>
                        <p>Explora nuestros insumos de repostería.</p>
                        <span className={styles.doorAction}>Ver productos</span>
                    </Link>
                </nav>
            </main>

            <footer className={styles.footer}>
                <a href={whatsappLink(CIUDAD_PASTEL_WHATSAPP)} target="_blank" rel="noreferrer" className={styles.footerLink}>
                    <MessageCircle size={16} aria-hidden="true" />
                    WhatsApp {formatPhone(CIUDAD_PASTEL_WHATSAPP)}
                </a>
                <Link to="/admin" className={styles.admin}>
                    Acceso de administración
                </Link>
            </footer>
        </div>
    );
}

export default Home;
