import { ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";

import DevelopmentTeam from "../../components/public/DevelopmentTeam";
import styles from "./DevelopmentTeamPage.module.css";

export default function DevelopmentTeamPage() {
    return (
        <div className={styles.page}>
            <nav aria-label="Navegación de equipo" className={styles.navigation}>
                <Link to="/"><ArrowLeft size={17} aria-hidden="true" /> Volver al inicio</Link>
            </nav>
            <DevelopmentTeam />
        </div>
    );
}
