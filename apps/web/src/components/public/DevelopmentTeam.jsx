import { ExternalLink } from "lucide-react";
import styles from "./DevelopmentTeam.module.css";

// Equipo de desarrollo de Ciudad Pastel. Datos estáticos: no requiere backend ni credenciales.
const MEMBERS = [
    { name: "Cristopher Araya Vega", github: "Crisaraya21" },
    { name: "Marlon Fabián Aragón Arce", github: "Fabian-1719" },
    { name: "Nahomy Vargas Solís", github: "nahomyVargasS" },
    { name: "Justin Mayorga Hernández", github: "JusMH" }
];

// GitHub's mark is an inline SVG: Lucide intentionally does not export brand logos.
function GitHubMark() {
    return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
            <path d="M12 .297a12 12 0 0 0-3.793 23.386c.6.112.82-.26.82-.577v-2.234c-3.338.726-4.043-1.416-4.043-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.09-.745.083-.73.083-.73 1.205.085 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.108-.775.418-1.305.762-1.605-2.665-.305-5.467-1.333-5.467-5.93 0-1.31.469-2.38 1.236-3.22-.124-.303-.536-1.524.117-3.176 0 0 1.008-.322 3.301 1.23a11.52 11.52 0 0 1 6.008 0c2.291-1.552 3.297-1.23 3.297-1.23.655 1.652.243 2.873.12 3.176.77.84 1.234 1.91 1.234 3.22 0 4.61-2.807 5.622-5.48 5.92.43.372.823 1.102.823 2.222v3.293c0 .32.216.694.825.576A12.001 12.001 0 0 0 12 .297"/>
        </svg>
    );
}

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
                                    <span className={styles.github}><GitHubMark /> GitHub <ExternalLink size={12} aria-hidden="true"/></span>
                                </span>
                            </a>
                        </li>
                    ))}
                </ul>
            </div>
        </section>
    );
}
