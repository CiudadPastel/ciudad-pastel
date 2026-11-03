import { useEffect, useState } from "react";
import { ImageOff } from "lucide-react";
import { useNavigate } from "react-router-dom";

import StateMessage, { RetryButton } from "../../components/ui/StateMessage";
import { getAdminProducts } from "../../services/products.service";
import { formatPrice } from "../../utils/format";

import styles from "./Products.module.css";

const PRODUCT_STATUS_LABELS = {
    published: "Publicado",
    withdrawn: "Retirado"
};

function ProductStatus({ status }) {
    const isPublished = status === "published";

    return (
        <span className={`${styles.badge} ${isPublished ? styles.published : styles.withdrawn}`}>
            {PRODUCT_STATUS_LABELS[status] ?? status}
        </span>
    );
}

function ProductAvailability({ available }) {
    return (
        <span className={`${styles.badge} ${available ? styles.available : styles.unavailable}`}>
            {available ? "Disponible" : "Agotado"}
        </span>
    );
}

function ProductImage({ product }) {
    if (product.imageUrl) {
        return <img className={styles.thumbnail} src={product.imageUrl} alt="" />;
    }

    return (
        <span className={styles.thumbnailEmpty} aria-hidden="true">
            <ImageOff size={20} />
        </span>
    );
}

function ProductsList() {
    const [state, setState] = useState({ status: "loading", products: [], error: null });
    const [reloadKey, setReloadKey] = useState(0);
    const navigate = useNavigate();

    useEffect(() => {
        let active = true;

        getAdminProducts()
            .then((products) => {
                if (active) setState({ status: "success", products, error: null });
            })
            .catch((error) => {
                if (active) setState({ status: "error", products: [], error });
            });

        return () => {
            active = false;
        };
    }, [reloadKey]);

    function retry() {
        setState({ status: "loading", products: [], error: null });
        setReloadKey((key) => key + 1);
    }

    return (
        <section className={styles.page}>
            <header className={styles.header}>
                <div>
                    <h1>Productos</h1>
                    <p className={styles.subtitle}>
                        Productos registrados, publicados o retirados.
                    </p>
                </div>
            </header>

            {state.status === "loading" && (
                <div className={styles.loading} role="status" aria-label="Cargando productos">
                    <span />
                    <span />
                    <span />
                </div>
            )}

            {state.status === "error" && (
                <StateMessage
                    variant="error"
                    title="No se pudieron cargar los productos"
                    description={state.error?.message}
                    action={<RetryButton onClick={retry} />}
                />
            )}

            {state.status === "success" && state.products.length === 0 && (
                <StateMessage
                    title="Aún no hay productos registrados"
                    description="Cuando se registre un producto aparecerá en esta lista."
                />
            )}

            {state.status === "success" && state.products.length > 0 && (
                <div className={styles.tableWrap}>
                    <table className={styles.table}>
                        <caption className="sr-only">Lista de productos</caption>
                        <thead>
                            <tr>
                                <th scope="col">Producto</th>
                                <th scope="col">Categoría</th>
                                <th scope="col">Precio</th>
                                <th scope="col">Disponibilidad</th>
                                <th scope="col">Estado</th>
                            </tr>
                        </thead>
                        <tbody>
                            {state.products.map((product) => (
                                <tr
                                    key={product.id}
                                    className={styles.productRow}
                                    role="link"
                                    tabIndex={0}
                                    aria-label={`Ver detalle de ${product.name}`}
                                    onClick={() => navigate(`/admin/productos/${encodeURIComponent(product.id)}`)}
                                    onKeyDown={(event) => {
                                        if (event.key === "Enter") {
                                            event.preventDefault();
                                            navigate(`/admin/productos/${encodeURIComponent(product.id)}`);
                                        }
                                    }}
                                >
                                    <td data-label="Producto">
                                        <div className={styles.productCell}>
                                            <ProductImage product={product} />
                                            <div>
                                                <span className={styles.productName}>
                                                    {product.name}
                                                </span>
                                                {product.description && (
                                                    <span className={styles.description}>
                                                        {product.description}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </td>
                                    <td data-label="Categoría">
                                        {product.category?.name ?? "Sin categoría"}
                                    </td>
                                    <td data-label="Precio" className={styles.price}>
                                        {formatPrice(product.price)}
                                    </td>
                                    <td data-label="Disponibilidad">
                                        <ProductAvailability available={product.available} />
                                    </td>
                                    <td data-label="Estado">
                                        <ProductStatus status={product.status} />
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </section>
    );
}

export default ProductsList;
