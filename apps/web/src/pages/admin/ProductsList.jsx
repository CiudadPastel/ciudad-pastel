import useAdminList from "../../hooks/useAdminList";
import { matchesSearch, paginateRecords, sortRecords } from "../../utils/adminList";
import { AdminListTools, AdminListPagination, AdminListSelect } from "../../components/admin/AdminListTools";
import { useEffect, useRef, useState } from "react";
import { ImageOff, LoaderCircle, Pencil, Plus, Trash2 } from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";

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
    const list = useAdminList();
    const filter = FILTERS.some((item) => item.value === list.params.get("estado")) ? list.params.get("estado") : "all";
    const setFilter = (value) => list.setParam("estado", value === "all" ? "" : value);
    const category = list.params.get("categoria") ?? "";
    const availability = ["true", "false"].includes(list.params.get("disponibilidad")) ? list.params.get("disponibilidad") : "";
    const [confirmingProduct, setConfirmingProduct] = useState(null);
    const [pendingProductId, setPendingProductId] = useState(null);
    const [notice, setNotice] = useState(null);
    const navigate = useNavigate();
    const location = useLocation();
    const noticeAfterReload = useRef(null);
    const locationFlashHandled = useRef(false);

    useEffect(() => {
        let active = true;

        getAdminProducts()
            .then((products) => {
                if (!active) return;

                setState({ status: "success", products, error: null });
                if (noticeAfterReload.current) {
                    setNotice({ variant: "success", text: noticeAfterReload.current });
                    noticeAfterReload.current = null;
                }
            })
            .catch((error) => {
                if (!active) return;

                setState({ status: "error", products: [], error });
                if (noticeAfterReload.current) {
                    setNotice({
                        variant: "error",
                        text: "El producto se retiró, pero no se pudo actualizar la lista. Intente de nuevo."
                    });
                }
            });

        return () => {
            active = false;
        };
    }, [reloadKey]);

    useEffect(() => {
        const flash = location.state?.flash;
        if (!flash || locationFlashHandled.current) return;

        if (state.status !== "success") return;

        locationFlashHandled.current = true;
        navigate(`${location.pathname}${location.search}`, { replace: true, state: null });
    }, [location.pathname, location.search, location.state?.flash, navigate, state.status]);

    function retry() {
        setNotice(null);
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
            noticeAfterReload.current = "Producto retirado correctamente.";
            setConfirmingProduct(null);
            setState((previous) => ({ ...previous, status: "loading", error: null }));
            setReloadKey((key) => key + 1);
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

    const categories = [...new Map(state.products.map((product) => [product.category?.id ?? "sin-categoria", product.category?.name ?? "Sin categoría"])).entries()].sort((a, b) => a[1].localeCompare(b[1], "es"));
    const searched = state.products.filter((product) => matchesSearch([product.name], list.debounced)
        && (!category || (product.category?.id ?? "sin-categoria") === category)
        && (!availability || String(product.available) === availability));
    const counts = Object.fromEntries(FILTERS.map(({ value }) => [value, searched.filter((product) => value === "all" || product.status === value).length]));
    const orders = [["updated-desc", "Última modificación"], ["name-asc", "Nombre: A–Z"], ["name-desc", "Nombre: Z–A"], ["price-asc", "Precio: menor a mayor"], ["price-desc", "Precio: mayor a menor"]];
    const order = orders.some(([key]) => key === list.params.get("orden")) ? list.params.get("orden") : "updated-desc";
    const filteredProducts = sortRecords(searched.filter((product) => filter === "all" || product.status === filter), order);
    const pagination = paginateRecords(filteredProducts, list.params.get("pagina"));
    const visibleProducts = pagination.items;
    const detailState = { from: location.pathname + location.search };
    const visibleNotice = notice ?? (
        state.status === "success" && location.state?.flash
            ? { variant: "success", text: location.state.flash }
            : null
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

            {visibleNotice && (
                <Notice
                    variant={visibleNotice.variant}
                    onClose={() => {
                        setNotice(null);
                        if (location.state?.flash) {
                            navigate(`${location.pathname}${location.search}`, {
                                replace: true,
                                state: null
                            });
                        }
                    }}
                >
                    {visibleNotice.text}
                </Notice>
            )}

            <AdminListTools list={list} placeholder="Buscar por nombre del producto…" orders={orders} defaultOrder="updated-desc" disabled={state.status !== "success"}>
                <AdminListSelect label="Categoría" value={category} onChange={(value) => list.setParam("categoria", value)}>
                    <option value="">Todas las categorías</option>
                    {categories.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
                    {category && !categories.some(([id]) => id === category) && <option value={category}>Categoría sin productos</option>}
                </AdminListSelect>
                <AdminListSelect label="Disponibilidad" value={availability} onChange={(value) => list.setParam("disponibilidad", value)}>
                    <option value="">Cualquier disponibilidad</option><option value="true">Disponible</option><option value="false">Agotado</option>
                </AdminListSelect>
            </AdminListTools>
            {state.status === "success" && <AdminListPagination total={filteredProducts.length} noun="productos" pagination={pagination} onPage={(page) => list.setParam("pagina", String(page))} />}
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
                    title="No hay productos con estos filtros"
                    description="Seleccione otro filtro para ver los demás productos."
                    action={
                        <button type="button" className="btn btn-secondary" onClick={list.clear}>
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
                                    onClick={() => navigate(`/admin/productos/${encodeURIComponent(product.id)}`, { state: detailState })}
                                    onKeyDown={(event) => {
                                        if (event.target === event.currentTarget && event.key === "Enter") {
                                            event.preventDefault();
                                            navigate(`/admin/productos/${encodeURIComponent(product.id)}`, { state: detailState });
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
                                                state={detailState}
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
