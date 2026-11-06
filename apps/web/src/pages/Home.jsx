import { useEffect, useState } from "react";
import { ArrowRight, BookOpen, ImageOff, Menu, MessageCircle, X } from "lucide-react";
import { Link } from "react-router-dom";

import logo from "../assets/logo-ciudad-pastel.png";
import { getPublicCourses } from "../services/publicCourses.service";
import { getPublicCategories } from "../services/publicProducts.service";
import { getPublicHomeContent, DEFAULT_HOME_CONTENT } from "../services/homeContent.service";
import { useWhatsAppContact } from "../hooks/useWhatsAppContact";
import { buildWhatsAppLink } from "../utils/whatsapp";
import { formatPrice } from "../utils/format";
import styles from "./Home.module.css";

function HomePicture({ src, alt, className = "" }) {
    return <HomePictureContent key={src ?? "sin-imagen"} src={src} alt={alt} className={className} />;
}

function HomePictureContent({ src, alt, className }) {
    const [failed, setFailed] = useState(false);
    if (!src || failed) {
        return <div className={`${styles.imagePlaceholder} ${className}`} aria-label="Fotografía pendiente de publicación">
            <ImageOff size={42} aria-hidden="true" />
            <span>Muy pronto, nuevas creaciones</span>
        </div>;
    }
    return <img src={src} alt={alt} className={className} onError={() => setFailed(true)} loading="lazy" />;
}

export default function Home() {
    const [data, setData] = useState(DEFAULT_HOME_CONTENT);
    const [courses, setCourses] = useState([]);
    const [categories, setCategories] = useState([]);
    const [menuOpen, setMenuOpen] = useState(false);
    const [notice, setNotice] = useState("");
    const contact = useWhatsAppContact();
    const waUrl = buildWhatsAppLink(contact);

    useEffect(() => {
        let active = true;
        Promise.allSettled([
            getPublicHomeContent(),
            getPublicCourses(),
            getPublicCategories()
        ]).then(([home, courseResult, categoryResult]) => {
            if (!active) return;
            if (home.status === "fulfilled") setData(home.value);
            else setNotice("Parte del contenido no se pudo cargar. Puedes seguir navegando por Academia y Tienda.");
            if (courseResult.status === "fulfilled" && Array.isArray(courseResult.value)) {
                setCourses(courseResult.value.slice(0, 2));
            }
            if (categoryResult.status === "fulfilled") setCategories(categoryResult.value.slice(0, 4));
        });
        return () => { active = false; };
    }, []);

    const { about } = data;
    return <div className={styles.page} id="inicio">
        <div className={styles.announcement}>UN ESPACIO PARA QUIENES AMAN CREAR CON SUS MANOS ✦ ACADEMIA & TIENDA</div>
        <header className={styles.header}>
            <Link to="/" className={styles.brand} aria-label="Ciudad Pastel, inicio">
                <img src={logo} alt="" /> <span>Ciudad <em>Pastel</em></span>
            </Link>
            <button className={styles.menuButton} type="button" onClick={() => setMenuOpen(!menuOpen)}
                aria-label={menuOpen ? "Cerrar menú" : "Abrir menú"} aria-expanded={menuOpen}>
                {menuOpen ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
            </button>
            <nav className={`${styles.nav} ${menuOpen ? styles.navOpen : ""}`} aria-label="Navegación principal">
                <a href="#academia" onClick={() => setMenuOpen(false)}>Academia</a>
                <a href="#tienda" onClick={() => setMenuOpen(false)}>Tienda</a>
                {about.visible && <a href="#nosotros" onClick={() => setMenuOpen(false)}>Sobre nosotros</a>}
                {waUrl && <a href={waUrl} target="_blank" rel="noopener noreferrer" className={styles.contactLink}><MessageCircle size={17}/> WhatsApp</a>}
            </nav>
        </header>

        <main>
            {notice && <p role="status" className={styles.notice}>{notice}</p>}
            <section className={styles.hero} aria-labelledby="home-title">
                <div className={styles.heroCopy}>
                    <p className={styles.eyebrow}>— UN MUNDO PARA CREAR</p>
                    <h1 id="home-title">La magia está en <em>tus manos.</em></h1>
                    <p className={styles.lead}>Aprende nuevas técnicas, encuentra los insumos que imaginas y dale vida a cada dulce idea.</p>
                    <div className={styles.heroActions}>
                        <Link to="/cursos" className={styles.primaryButton}>Descubrir la academia <ArrowRight size={17} /></Link>
                        <Link to="/tienda" className={styles.textLink}>Explorar la tienda <ArrowRight size={17}/></Link>
                    </div>
                    <span className={styles.scrollHint}>01 / 03 <span>DESLIZA PARA DESCUBRIR ↓</span></span>
                </div>
                <div className={styles.heroImage}>
                    <HomePicture src={data.heroImageUrl} alt="Creación de repostería de Ciudad Pastel" className={styles.coverImage} />
                    <span className={styles.seal}>EL ARTE<br/>DE CREAR<br/>ALGO DULCE ✳</span>
                </div>
            </section>
            <section className={styles.manifesto}>
                <span aria-hidden="true">✦</span>
                <p>Inspiración para aprender. Herramientas para crear.<br/><em>Momentos para compartir.</em></p>
                <span aria-hidden="true">✦</span>
            </section>
            <section className={styles.academy} id="academia">
                <div className={styles.sectionHeading}>
                    <div>
                        <p className={styles.eyebrow}>01 / APRENDE A TU RITMO</p>
                        <h2>Un poco de arte,<br/><em>un mucho de sabor.</em></h2>
                    </div>
                    <Link to="/cursos" className={styles.textLink}>Ver todos los cursos <ArrowRight size={17}/></Link>
                </div>
                {courses.length > 0 ? <div className={styles.courseGrid}>
                    {courses.map(course => <Link to={`/cursos/${encodeURIComponent(course.id)}`} key={course.id} className={styles.courseCard}>
                        <HomePicture src={course.imageUrl} alt={`Curso: ${course.name}`} className={styles.courseImage}/>
                        <div className={styles.courseInfo}>
                            <div><p className={styles.eyebrow}>ACADEMIA · CURSO</p><h3>{course.name}</h3>
                                {course.price != null && <p className={styles.coursePrice}>{course.price === 0 ? "Gratis" : formatPrice(course.price)}</p>}
                            </div>
                            <ArrowRight size={21} aria-hidden="true"/>
                        </div>
                    </Link>)}
                </div> : <div className={styles.emptyCourses}><BookOpen size={26} aria-hidden="true"/><p>Explora nuestra academia para conocer los cursos disponibles.</p><Link to="/cursos">Ver academia <ArrowRight size={16}/></Link></div>}
            </section>
            <section id="tienda" className={styles.store}>
                <div className={styles.storeImage}><HomePicture src={data.storeImageUrl} alt="Insumos de repostería de Ciudad Pastel" className={styles.coverImage}/></div>
                <div className={styles.storeCopy}>
                    <p className={styles.eyebrow}>02 / TODO PARA TUS IDEAS</p>
                    <h2>Los detalles hacen <em>la diferencia.</em></h2>
                    <p className={styles.lead}>Utensilios, ingredientes y decoración para transformar tus ideas en deliciosas creaciones.</p>
                    {categories.length > 0 && <div className={styles.categoryLinks} aria-label="Categorías disponibles">
                        {categories.map(category => <Link key={category.id} to={`/tienda?categoria=${encodeURIComponent(category.id)}`}>{category.name}</Link>)}
                    </div>}
                    <Link to="/tienda" className={styles.primaryButton}>Visitar la tienda <ArrowRight size={17}/></Link>
                </div>
            </section>
            {about.visible && <section id="nosotros" className={styles.about}>
                <div className={styles.aboutCopy}>
                    <p className={styles.eyebrow}>03 / NUESTRA ESENCIA</p>
                    <h2>{about.title}</h2>
                    <p className={styles.aboutDescription}>{about.description}</p>
                </div>
                {about.imageUrl && <HomePicture src={about.imageUrl} alt="Imagen sobre Ciudad Pastel" className={styles.aboutImage}/>}
            </section>}
        </main>
        <footer className={styles.footer}>
            <div><strong>Ciudad <em>Pastel</em></strong><p>Academia y tienda de repostería.</p></div>
            <div className={styles.footerLinks}>{waUrl && <a href={waUrl} target="_blank" rel="noopener noreferrer">WhatsApp</a>}<Link to="/admin">Administración</Link><a href="#inicio">Volver arriba ↑</a></div>
        </footer>
    </div>;
}
