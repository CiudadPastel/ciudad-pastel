import { useEffect, useState } from "react";
import { ImageOff, LoaderCircle, Pencil, Plus, Trash2 } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";

import ConfirmDialog from "../../components/ui/ConfirmDialog";
import Notice from "../../components/ui/Notice";
import StateMessage, { RetryButton } from "../../components/ui/StateMessage";
import { getAdminProducts, removeAdminProduct } from "../../services/products.service";
import { formatPrice } from "../../utils/format";

import styles from "./Products.module.css";

const PRODUCT_STATUS_LABELS = {
    published: "Publicado",
    withdrawn: "Retirado"
};

const FILTERS = [
    { value: "all", label: "Todos" },
    { value: "published", label: "Publicados" },
    { value: "withdrawn", label: "Retirados" }
];

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
    const [filter, setFilter] = useState("all");
    const [confirmingProduct, setConfirmingProduct] = useState(null);
    const [pendingProductId, setPendingProductId] = useState(null);
    const [notice, setNotice] = useState(null);
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

    async function confirmRemoveProduct() {
        const product = confirmingProduct;
        if (!product) return;

        setPendingProductId(product.id);
        setNotice(null);

        try {
            await removeAdminProduct(product.id);
            setState((previous) => ({
                ...previous,
                products: previous.products.map((item) =>
                    item.id === product.id ? { ...item, status: "withdrawn" } : item
                )
            }));
            setNotice({
                variant: "success",
                text: `«${product.name}» se retiró y dejó de mostrarse en la tienda.`
            });
            setConfirmingProduct(null);
        } catch (error) {
            setNotice({
                variant: "error",
                text: error.message || `No se pudo retirar «${product.name}».`
            });
            setConfirmingProduct(null);
        } finally {
            setPendingProductId(null);
        }
    }

    const counts = {
        all: state.products.length,
        published: state.products.filter((product) => product.status === "published").length,
        withdrawn: state.products.filter((product) => product.status === "withdrawn").length
    };
    const visibleProducts = state.products.filter((product) =>
        filter === "all" || product.status === filter
    );

    return (
        <section className={styles.page}>
            <header className={styles.header}>
                <div>
                    <h1>Productos</h1>
                    <p className={styles.subtitle}>
                        Productos registrados, publicados o retirados.
                    </p>
                </div>
                <Link to="/admin/productos/nuevo" className="btn btn-primary">
                    <Plus size={18} aria-hidden="true" />
                    Nuevo producto
                </Link>
            </header>

            {notice && (
                <Notice
                    variant={notice.variant}
                    onClose={() => setNotice(null)}
                >
                    {notice.text}
                </Notice>
            )}

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
                <div className={styles.filters} role="group" aria-label="Filtrar productos por estado">
                    {FILTERS.map(({ value, label }) => (
                        <button
                            key={value}
                            type="button"
                            className={`${styles.filter} ${filter === value ? styles.filterActive : ""}`}
                            aria-pressed={filter === value}
                            onClick={() => setFilter(value)}
                        >
                            {label}
                            <span className={styles.count}>{counts[value]}</span>
                        </button>
                    ))}
                </div>
            )}

            {state.status === "success" && state.products.length > 0 && visibleProducts.length === 0 && (
                <StateMessage
                    title={filter === "published" ? "No hay productos publicados" : "No hay productos retirados"}
                    description="Seleccione otro filtro para ver los demás productos."
                    action={
                        <button type="button" className="btn btn-secondary" onClick={() => setFilter("all")}>
                            Ver todos
                        </button>
                    }
                />
            )}

            {state.status === "success" && visibleProducts.length > 0 && (
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
                                <th scope="col"><span className="sr-only">Acciones</span></th>
                            </tr>
                        </thead>
                        <tbody>
                            {visibleProducts.map((product) => (
                                <tr
                                    key={product.id}
                                    className={`${styles.productRow} ${product.status === "withdrawn" ? styles.withdrawnRow : ""}`}
                                    role="link"
                                    tabIndex={0}
                                    aria-label={`Ver detalle de ${product.name}`}
                                    onClick={() => navigate(`/admin/productos/${encodeURIComponent(product.id)}`)}
                                    onKeyDown={(event) => {
                                        if (event.target === event.currentTarget && event.key === "Enter") {
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
                                    <td data-label="Acciones" className={styles.rowActions}>
                                        <div className={styles.rowActionButtons}>
                                            <Link
                                                to={`/admin/productos/${encodeURIComponent(product.id)}/editar`}
                                                className={styles.editLink}
                                                aria-label={`Editar ${product.name}`}
                                                onClick={(event) => event.stopPropagation()}
                                                onKeyDown={(event) => event.stopPropagation()}
                                            >
                                                <Pencil size={16} aria-hidden="true" />
                                                Editar
                                            </Link>
                                            {product.status !== "withdrawn" && (
                                                <button
                                                    type="button"
                                                    className={`${styles.editLink} ${styles.removeButton}`}
                                                    aria-label={`Retirar ${product.name}`}
                                                    disabled={pendingProductId === product.id}
                                                    onClick={(event) => {
                                                        event.stopPropagation();
                                                        setConfirmingProduct(product);
                                                    }}
                                                    onKeyDown={(event) => event.stopPropagation()}
                                                >
                                                    {pendingProductId === product.id ? (
                                                        <LoaderCircle size={16} className={styles.spin} aria-hidden="true" />
                                                    ) : (
                                                        <Trash2 size={16} aria-hidden="true" />
                                                    )}
                                                    {pendingProductId === product.id ? "Retirando…" : "Retirar"}
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {confirmingProduct && (
                <ConfirmDialog
                    open
                    title={`¿Retirar «${confirmingProduct.name}»?`}
                    confirmLabel={pendingProductId === confirmingProduct.id ? "Retirando…" : "Sí, retirar"}
                    confirmIcon={Trash2}
                    busy={pendingProductId === confirmingProduct.id}
                    onConfirm={confirmRemoveProduct}
                    onCancel={() => setConfirmingProduct(null)}
                >
                    <p>Dejará de mostrarse en la tienda. El producto permanecerá en la lista de administración como retirado.</p>
                </ConfirmDialog>
            )}
        </section>
    );
}

export default ProductsList;
