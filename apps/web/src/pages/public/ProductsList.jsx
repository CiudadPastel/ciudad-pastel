import { useEffect, useState } from "react";
import { ImageOff } from "lucide-react";
import { Link } from "react-router-dom";

import StateMessage, { RetryButton } from "../../components/ui/StateMessage";
import { getPublicProducts } from "../../services/publicProducts.service";
import { formatPrice } from "../../utils/format";

import styles from "./ProductsList.module.css";

const PAGE_SIZE = 12;

function validateProductsPage(response) {
    if (
        !response
        || !Array.isArray(response.items)
        || !Number.isInteger(response.page)
        || typeof response.hasMore !== "boolean"
    ) {
        throw new Error("La respuesta del catálogo no es válida.");
    }

    return response;
}

function ProductCard({ product }) {
    const [imageFailed, setImageFailed] = useState(false);

    return (
        <Link to={`/tienda/${encodeURIComponent(product.id)}`} className={styles.card}>
            {product.imageUrl && !imageFailed ? (
                <img
                    src={product.imageUrl}
                    alt={`Imagen de ${product.name}`}
                    className={styles.image}
                    loading="lazy"
                    onError={() => setImageFailed(true)}
                />
            ) : (
                <div className={styles.imageEmpty} aria-hidden="true">
                    <ImageOff size={28} />
                </div>
            )}
            <div className={styles.cardBody}>
                <h2>{product.name}</h2>
                <div className={styles.cardMeta}>
                    <strong>{formatPrice(product.price)}</strong>
                    {!product.available && <span className={styles.unavailable}>Agotado</span>}
                </div>
            </div>
        </Link>
    );
}

function ProductSkeleton() {
    return (
        <li className={styles.skeletonCard} aria-hidden="true">
            <div className={styles.skeletonImage} />
            <div className={styles.skeletonBody}>
                <div className={styles.skeletonName} />
                <div className={styles.skeletonPrice} />
            </div>
        </li>
    );
}

function ProductsList() {
    const [reloadKey, setReloadKey] = useState(0);
    const [state, setState] = useState({
        key: null,
        status: "loading",
        products: [],
        page: 0,
        hasMore: false,
        error: null,
        loadingMore: false,
        loadMoreError: null
    });

    useEffect(() => {
        let active = true;

        setState({
            key: reloadKey,
            status: "loading",
            products: [],
            page: 0,
            hasMore: false,
            error: null,
            loadingMore: false,
            loadMoreError: null
        });

        getPublicProducts({ page: 1, limit: PAGE_SIZE })
            .then(validateProductsPage)
            .then((result) => {
                if (active) {
                    setState({
                        key: reloadKey,
                        status: "success",
                        products: result.items,
                        page: result.page,
                        hasMore: result.hasMore,
                        error: null,
                        loadingMore: false,
                        loadMoreError: null
                    });
                }
            })
            .catch((error) => {
                if (active) {
                    setState({
                        key: reloadKey,
                        status: "error",
                        products: [],
                        page: 0,
                        hasMore: false,
                        error,
                        loadingMore: false,
                        loadMoreError: null
                    });
                }
            });

        return () => {
            active = false;
        };
    }, [reloadKey]);

    async function loadMore() {
        if (state.loadingMore || !state.hasMore) return;

        setState((current) => ({ ...current, loadingMore: true, loadMoreError: null }));

        try {
            const result = validateProductsPage(
                await getPublicProducts({ page: state.page + 1, limit: PAGE_SIZE })
            );

            setState((current) => {
                const knownIds = new Set(current.products.map((product) => product.id));
                const newProducts = result.items.filter((product) => !knownIds.has(product.id));

                return {
                    ...current,
                    products: [...current.products, ...newProducts],
                    page: result.page,
                    hasMore: result.hasMore,
                    loadingMore: false,
                    loadMoreError: null
                };
            });
        } catch (error) {
            setState((current) => ({
                ...current,
                loadingMore: false,
                loadMoreError: error
            }));
        }
    }

    const status = state.key === reloadKey ? state.status : "loading";

    return (
        <section className={styles.page} aria-busy={status === "loading" || state.loadingMore}>
            <header className={styles.heading}>
                <div>
                    <p className={styles.eyebrow}>Ciudad Pastel · Tienda</p>
                    <h1>Tienda</h1>
                    <p className={styles.subtitle}>Descubre productos para tus creaciones.</p>
                </div>
            </header>

            <div className={styles.filtersPlaceholder} />

            {status === "loading" ? (
                <ul className={styles.grid} aria-label="Cargando productos" role="status">
                    {Array.from({ length: PAGE_SIZE }, (_, index) => (
                        <ProductSkeleton key={index} />
                    ))}
                </ul>
            ) : status === "error" ? (
                <StateMessage
                    variant="error"
                    title="No se pudieron cargar los productos"
                    description={state.error?.message}
                    action={<RetryButton onClick={() => setReloadKey((key) => key + 1)} />}
                />
            ) : state.products.length === 0 ? (
                <StateMessage title="No hay productos disponibles en este momento" />
            ) : (
                <>
                    <ul className={styles.grid}>
                        {state.products.map((product) => (
                            <li key={product.id}>
                                <ProductCard product={product} />
                            </li>
                        ))}
                    </ul>
                    {state.loadMoreError ? (
                        <StateMessage
                            variant="error"
                            title="No se pudieron cargar más productos"
                            description={state.loadMoreError.message}
                            action={<RetryButton onClick={loadMore} />}
                        />
                    ) : state.hasMore ? (
                        <div className={styles.loadMore}>
                            <button
                                type="button"
                                className="btn btn-secondary"
                                disabled={state.loadingMore}
                                onClick={loadMore}
                            >
                                {state.loadingMore ? "Cargando productos…" : "Cargar más"}
                            </button>
                        </div>
                    ) : null}
                </>
            )}
        </section>
    );
}

export default ProductsList;
