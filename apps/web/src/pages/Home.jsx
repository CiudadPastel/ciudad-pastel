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

            <footer>
                <Link to="/admin">
                    Administración
                </Link>
            </footer>
        </main>
    );
}

export default Home;