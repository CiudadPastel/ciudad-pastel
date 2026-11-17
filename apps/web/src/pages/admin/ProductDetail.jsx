import { adminReturnTo } from "../../utils/adminList";
import { useEffect, useState } from "react";
import { ArrowLeft, ImageOff, Package, Pencil, Trash2 } from "lucide-react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";

import ConfirmDialog from "../../components/ui/ConfirmDialog";
import Notice from "../../components/ui/Notice";
import StateMessage, { RetryButton } from "../../components/ui/StateMessage";
import { getAdminProductById, removeAdminProduct } from "../../services/products.service";
import { formatDateTime, formatPrice } from "../../utils/format";

import styles from "./Products.module.css";

const PRODUCT_STATUS_LABELS = {
    published: "Publicado",
    withdrawn: "Retirado"
};

function ProductDetail() {
    const { id } = useParams();
    const location = useLocation();
    const backTo = adminReturnTo(location.state?.from, "/admin/productos");
    const navigate = useNavigate();
    const [state, setState] = useState({ id: null, status: "loading", product: null, error: null });
    const [reloadKey, setReloadKey] = useState(0);
    const [notice, setNotice] = useState(
        location.state?.flash ? { variant: "success", text: location.state.flash } : null
    );
    const [confirmingRemoval, setConfirmingRemoval] = useState(false);
    const [removing, setRemoving] = useState(false);

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

    async function confirmRemoveProduct() {
        if (!product || removing) return;

        setRemoving(true);
        setNotice(null);
        try {
            await removeAdminProduct(product.id);
            navigate(backTo, {
                replace: true,
                state: { flash: "Producto retirado correctamente." }
            });
        } catch (error) {
            setNotice({
                variant: "error",
                text: error.message || `No se pudo retirar «${product.name}».`
            });
            setConfirmingRemoval(false);
        } finally {
            setRemoving(false);
        }
    }

    const isCurrentState = state.id === id;
    const status = isCurrentState ? state.status : "loading";
    const product = isCurrentState ? state.product : null;
    const error = isCurrentState ? state.error : null;

    return (
        <section className={styles.page}>
            <Link to={backTo} className={styles.backLink}>
                <ArrowLeft size={18} aria-hidden="true" />
                Volver a productos
            </Link>

            {notice && (
                <Notice variant={notice.variant} onClose={() => setNotice(null)}>
                    {notice.text}
                </Notice>
            )}

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
                        <Link to={backTo} className="btn btn-primary">
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
                            <p>Edite la información del producto o retire el producto de la venta.</p>
                        </div>
                        <div className={styles.actionButtons}>
                            {product.status === "withdrawn" ? (
                                <button type="button" className="btn btn-secondary" disabled>
                                    <Pencil size={16} aria-hidden="true" />
                                    Producto retirado
                                </button>
                            ) : (
                                <Link
                                    to={`/admin/productos/${encodeURIComponent(product.id)}/editar`}
                                    state={{ from: backTo }}
                                    className="btn btn-secondary"
                                >
                                    <Pencil size={16} aria-hidden="true" />
                                    Editar
                                </Link>
                            )}
                            {product.status !== "withdrawn" && (
                                <button
                                    type="button"
                                    className="btn btn-danger"
                                    onClick={() => setConfirmingRemoval(true)}
                                >
                                    <Trash2 size={16} aria-hidden="true" />
                                    Retirar
                                </button>
                            )}
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
                        <Link to={backTo} className="btn btn-primary">
                            Volver a productos
                        </Link>
                    }
                />
            )}

            {confirmingRemoval && product && (
                <ConfirmDialog
                    open
                    title={`¿Retirar «${product.name}»?`}
                    confirmLabel={removing ? "Retirando…" : "Sí, retirar"}
                    confirmIcon={Trash2}
                    busy={removing}
                    onConfirm={confirmRemoveProduct}
                    onCancel={() => setConfirmingRemoval(false)}
                >
                    <p>Dejará de mostrarse en la tienda. El producto permanecerá en la lista de administración como retirado.</p>
                </ConfirmDialog>
            )}
        </section>
    );
}

export default ProductDetail;
