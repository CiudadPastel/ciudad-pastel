import { Link } from "react-router-dom";

import StateMessage from "../../components/ui/StateMessage";

import styles from "./ProductsList.module.css";

function ProductDetailPlaceholder() {
    return (
        <section className={styles.page}>
            <h1>Producto</h1>
            <StateMessage
                title="El detalle de este producto estará disponible próximamente"
                action={<Link to="/tienda" className="btn btn-secondary">Volver a la tienda</Link>}
            />
        </section>
    );
}

export default ProductDetailPlaceholder;
