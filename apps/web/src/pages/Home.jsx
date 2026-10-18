import { BookOpen } from "lucide-react";
import { Link } from "react-router-dom";

function Home() {
    return (
        <main>
            <h1>Ciudad Pastel</h1>

            <p>
                Bienvenido a Ciudad Pastel.
            </p>

            <p>
                Próximamente aquí estará la tienda
                y la oferta académica.
            </p>

            <p>
                <Link to="/cursos" className="btn btn-primary">
                    <BookOpen size={16} aria-hidden="true" />
                    Ver cursos
                </Link>
            </p>

            <footer>
                <Link to="/admin">
                    Administración
                </Link>
            </footer>
        </main>
    );
}

export default Home;