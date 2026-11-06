import { Github, ExternalLink } from "lucide-react";
import styles from "./DevelopmentTeam.module.css";

// Equipo de desarrollo de Ciudad Pastel. Datos estáticos: no requiere backend ni credenciales.
const MEMBERS = [
    { name: "Cristopher Araya Vega", github: "Crisaraya21" },
    { name: "Marlon Fabián Aragón Arce", github: "Fabian-1719" },
    { name: "Nahomy Vargas Solís", github: "nahomyVargasS" },
    { name: "Justin Mayorga Hernández", github: "JusMH" }
];

export default function DevelopmentTeam() {
    return (
        <section className={styles.section} aria-labelledby="team-title">
            <div className={styles.container}>
                <p className={styles.eyebrow}>QUIÉNES CREARON ESTA PLATAFORMA</p>
                <h2 id="team-title">Equipo de desarrollo</h2>
                <ul className={styles.grid}>
                    {MEMBERS.map(({ name, github }) => (
                        <li key={github}>
                            <a className={styles.card} href={`https://github.com/${github}`}
                                target="_blank" rel="noopener noreferrer"
                                aria-label={`Ver perfil de GitHub de ${name}, abre en otra pestaña`}>
                                <span className={styles.avatar} aria-hidden="true">{name[0]}</span>
                                <span className={styles.details}>
                                    <strong>{name}</strong>
                                    <span className={styles.github}><Github size={16} aria-hidden="true"/> GitHub <ExternalLink size={12} aria-hidden="true"/></span>
                                </span>
                            </a>
                        </li>
                    ))}
                </ul>
            </div>
        </section>
    );
}
