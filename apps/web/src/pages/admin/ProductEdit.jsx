import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { Link, useParams } from "react-router-dom";

import ProductCreate from "./ProductCreate";
import StateMessage, { RetryButton } from "../../components/ui/StateMessage";
import { getAdminProductForEdit } from "../../services/products.service";

import styles from "./Products.module.css";

function ProductEdit() {
    const { id } = useParams();
    const [state, setState] = useState({ id: null, status: "loading", product: null, error: null });
    const [reloadKey, setReloadKey] = useState(0);

    useEffect(() => {
        let active = true;

        getAdminProductForEdit(id)
            .then((product) => {
                if (active) setState({ id, status: "success", product, error: null });
            })
            .catch((error) => {
                if (active) setState({ id, status: "error", product: null, error });
            });

        return () => {
            active = false;
        };
    }, [id, reloadKey]);

    function retry() {
        setState({ id, status: "loading", product: null, error: null });
        setReloadKey((key) => key + 1);
    }

    const isCurrentState = state.id === id;
    const status = isCurrentState ? state.status : "loading";
    const product = isCurrentState ? state.product : null;
    const error = isCurrentState ? state.error : null;

    if (status === "loading") {
        return (
            <section className={styles.page}>
                <Link to={`/admin/productos/${encodeURIComponent(id)}`} className={styles.backLink}>
                    <ArrowLeft size={18} aria-hidden="true" />
                    Volver al producto
                </Link>
                <div className={styles.loadingDetail} role="status">
                    <span className={styles.loadingLine} />
                    <span className={styles.loadingLine} />
                    <span className={styles.loadingLine} />
                    Cargando producto…
                </div>
            </section>
        );
    }

    if (status === "error" && error?.status === 404) {
        return (
            <section className={styles.page}>
                <StateMessage
                    title="No encontramos este producto"
                    description="Puede que el enlace no sea válido o que el producto ya no exista."
                    action={
                        <Link to="/admin/productos" className="btn btn-primary">
                            Volver a productos
                        </Link>
                    }
                />
            </section>
        );
    }

    if (status === "error") {
        return (
            <section className={styles.page}>
                <StateMessage
                    variant="error"
                    title="No se pudo cargar el producto"
                    description={error?.message}
                    action={<RetryButton onClick={retry} />}
                />
            </section>
        );
    }

    if (product.status === "withdrawn") {
        return (
            <section className={styles.page}>
                <StateMessage
                    title="Este producto fue retirado"
                    description="Los productos retirados no se pueden editar."
                    action={
                        <Link to={`/admin/productos/${encodeURIComponent(product.id)}`} className="btn btn-primary">
                            Volver al producto
                        </Link>
                    }
                />
            </section>
        );
    }

    return <ProductCreate key={product.id} product={product} />;
}

export default ProductEdit;
