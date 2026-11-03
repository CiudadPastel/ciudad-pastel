import { useEffect, useState } from "react";
import { ArrowLeft, ImageOff, Package, Pencil, Trash2 } from "lucide-react";
import { Link, useParams } from "react-router-dom";

import StateMessage, { RetryButton } from "../../components/ui/StateMessage";
import { getAdminProductById } from "../../services/products.service";
import { formatDateTime, formatPrice } from "../../utils/format";

import styles from "./Products.module.css";

const PRODUCT_STATUS_LABELS = {
    published: "Publicado",
    withdrawn: "Retirado"
};

function ProductDetail() {
    const { id } = useParams();
    const [state, setState] = useState({ id: null, status: "loading", product: null, error: null });
    const [reloadKey, setReloadKey] = useState(0);

    useEffect(() => {
        let active = true;

        getAdminProductById(id)
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

    return (
        <section className={styles.page}>
            <Link to="/admin/productos" className={styles.backLink}>
                <ArrowLeft size={18} aria-hidden="true" />
                Volver a productos
            </Link>

            {status === "loading" && (
                <div className={styles.loadingDetail} role="status">
                    <span className={styles.loadingImage} />
                    <span className={styles.loadingLine} />
                    <span className={styles.loadingLine} />
                    <span className={styles.loadingLine} />
                    Cargando producto…
                </div>
            )}

            {status === "error" && error?.status === 404 && (
                <StateMessage
                    title="No encontramos este producto"
                    description="Puede que el enlace no sea válido o que el producto ya no esté disponible."
                    action={
                        <Link to="/admin/productos" className="btn btn-primary">
                            Volver a productos
                        </Link>
                    }
                />
            )}

            {status === "error" && error?.status !== 404 && (
                <StateMessage
                    variant="error"
                    title="No se pudo cargar el producto"
                    description={error?.message}
                    action={<RetryButton onClick={retry} />}
                />
            )}

            {status === "success" && product && (
                <>
                    <header className={styles.detailHeader}>
                        <div>
                            <h1>{product.name}</h1>
                            <p className={styles.subtitle}>Detalle del producto</p>
                        </div>
                    </header>

                    <div className={styles.detailCard}>
                        <div className={styles.detailImage}>
                            {product.imageUrl ? (
                                <img src={product.imageUrl} alt={`Imagen de ${product.name}`} />
                            ) : (
                                <div className={styles.detailImageEmpty}>
                                    <ImageOff size={36} aria-hidden="true" />
                                    <span>Sin imagen</span>
                                </div>
                            )}
                        </div>

                        <div className={styles.detailContent}>
                            <div className={styles.detailBadges}>
                                <span className={`${styles.badge} ${product.available ? styles.available : styles.unavailable}`}>
                                    {product.available ? "Disponible" : "Agotado"}
                                </span>
                                <span className={`${styles.badge} ${product.status === "published" ? styles.published : styles.withdrawn}`}>
                                    {PRODUCT_STATUS_LABELS[product.status] ?? product.status}
                                </span>
                            </div>

                            <p className={styles.detailPrice}>{formatPrice(product.price)}</p>

                            <dl className={styles.details}>
                                <div>
                                    <dt>Categoría</dt>
                                    <dd>{product.category?.name ?? "Sin categoría"}</dd>
                                </div>
                                <div>
                                    <dt>Descripción</dt>
                                    <dd>{product.description || "Sin descripción"}</dd>
                                </div>
                                <div>
                                    <dt>Imagen</dt>
                                    <dd>{product.imageUrl ? "Imagen registrada" : "Sin imagen"}</dd>
                                </div>
                                <div>
                                    <dt>Creado</dt>
                                    <dd>{formatDateTime(product.createdAt)}</dd>
                                </div>
                                <div>
                                    <dt>Última modificación</dt>
                                    <dd>{formatDateTime(product.updatedAt)}</dd>
                                </div>
                            </dl>
                        </div>
                    </div>

                    <section className={styles.actions} aria-labelledby="product-actions-title">
                        <div>
                            <h2 id="product-actions-title">Acciones del producto</h2>
                            <p>La edición y el retiro estarán disponibles próximamente.</p>
                        </div>
                        <div className={styles.actionButtons}>
                            <button type="button" className="btn btn-secondary" disabled>
                                <Pencil size={16} aria-hidden="true" />
                                Editar producto
                            </button>
                            <button type="button" className="btn btn-secondary" disabled>
                                <Trash2 size={16} aria-hidden="true" />
                                Retirar producto
                            </button>
                        </div>
                    </section>
                </>
            )}

            {status === "success" && !product && (
                <StateMessage
                    title="No encontramos este producto"
                    description="Puede que el enlace no sea válido o que el producto ya no esté disponible."
                    icon={Package}
                    action={
                        <Link to="/admin/productos" className="btn btn-primary">
                            Volver a productos
                        </Link>
                    }
                />
            )}
        </section>
    );
}

export default ProductDetail;
