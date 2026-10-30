import { useEffect, useState } from "react";
import { ImageOff, LayoutGrid, X } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";

import CategoryFilter from "../../components/public/CategoryFilter";
import StateMessage, { RetryButton } from "../../components/ui/StateMessage";
import { getPublicCategories, getPublicProducts } from "../../services/publicProducts.service";
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

const EMPTY_PRODUCTS = {
    status: "loading",
    products: [],
    total: null,
    page: 0,
    hasMore: false,
    error: null,
    loadingMore: false,
    loadMoreError: null
};

function productCountLabel(count) {
    return `${count} ${count === 1 ? "producto" : "productos"}`;
}

function ProductsList() {
    // La categoría elegida vive en la URL (?categoria=id) para poder compartirla
    // y para que el botón "atrás" del navegador deshaga el filtro.
    const [searchParams, setSearchParams] = useSearchParams();
    const categoryId = searchParams.get("categoria") || null;

    const [reloadKey, setReloadKey] = useState(0);
    const requestKey = `${categoryId ?? ""}|${reloadKey}`;
    const [state, setState] = useState({ key: null, ...EMPTY_PRODUCTS });

    const [categoriesReloadKey, setCategoriesReloadKey] = useState(0);
    const [categoriesState, setCategoriesState] = useState({ key: null, status: "loading", items: [] });
    // Total sin filtro, para el chip "Todos los productos"
    const [allTotal, setAllTotal] = useState(null);

    useEffect(() => {
        let active = true;

        getPublicCategories()
            .then((items) => {
                if (active) setCategoriesState({ key: categoriesReloadKey, status: "success", items });
            })
            .catch(() => {
                if (active) setCategoriesState({ key: categoriesReloadKey, status: "error", items: [] });
            });

        return () => {
            active = false;
        };
    }, [categoriesReloadKey]);

    useEffect(() => {
        let active = true;

        getPublicProducts({ page: 1, limit: PAGE_SIZE, categoryId: categoryId ?? undefined })
            .then(validateProductsPage)
            .then((result) => {
                if (!active) return;
                setState({
                    ...EMPTY_PRODUCTS,
                    key: requestKey,
                    status: "success",
                    products: result.items,
                    total: Number.isInteger(result.total) ? result.total : null,
                    page: result.page,
                    hasMore: result.hasMore
                });
                if (!categoryId && Number.isInteger(result.total)) setAllTotal(result.total);
            })
            .catch((error) => {
                if (active) setState({ ...EMPTY_PRODUCTS, key: requestKey, status: "error", error });
            });

        return () => {
            active = false;
        };
    }, [categoryId, requestKey]);

    async function loadMore() {
        if (state.loadingMore || !state.hasMore) return;

        // Si el usuario cambia de categoría mientras carga, esta respuesta se descarta.
        const keyAtStart = requestKey;
        setState((current) => ({ ...current, loadingMore: true, loadMoreError: null }));

        try {
            const result = validateProductsPage(
                await getPublicProducts({
                    page: state.page + 1,
                    limit: PAGE_SIZE,
                    categoryId: categoryId ?? undefined
                })
            );

            setState((current) => {
                if (current.key !== keyAtStart) return current;
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
            setState((current) => (current.key !== keyAtStart ? current : {
                ...current,
                loadingMore: false,
                loadMoreError: error
            }));
        }
    }

    function selectCategory(id) {
        if (id === categoryId) return;
        const next = new URLSearchParams(searchParams);
        if (id) next.set("categoria", id);
        else next.delete("categoria");
        setSearchParams(next);
    }

    const status = state.key === requestKey ? state.status : "loading";
    const categoriesStatus = categoriesState.key === categoriesReloadKey ? categoriesState.status : "loading";
    const categories = categoriesState.items;
    const selectedCategory = categoryId
        ? categories.find((category) => category.id === categoryId) ?? null
        : null;
    // La URL trae una categoría que ya no existe o que se quedó sin productos
    const unknownCategory = Boolean(categoryId) && categoriesStatus === "success" && !selectedCategory;
    const categoryName = selectedCategory?.name;

    const showAllButton = (
        <button type="button" className="btn btn-primary" onClick={() => selectCategory(null)}>
            <LayoutGrid size={16} aria-hidden="true" />
            Ver todos los productos
        </button>
    );

    return (
        <section className={styles.page} aria-busy={status === "loading" || state.loadingMore}>
            <header className={styles.heading}>
                <div>
                    <p className={styles.eyebrow}>Ciudad Pastel · Tienda</p>
                    <h1>Tienda</h1>
                    <p className={styles.subtitle}>Descubre productos para tus creaciones.</p>
                </div>
            </header>

            <div className={styles.filters}>
                <CategoryFilter
                    categories={categories}
                    selectedId={categoryId}
                    totalCount={allTotal ?? undefined}
                    status={categoriesStatus}
                    onSelect={selectCategory}
                    onRetry={() => setCategoriesReloadKey((key) => key + 1)}
                />

                <div className={styles.summary} aria-live="polite">
                    {status === "success" && state.products.length > 0 && Number.isInteger(state.total) && (
                        <p>
                            {categoryId && categoryName ? (
                                <>
                                    <strong>{productCountLabel(state.total)}</strong> en <strong>{categoryName}</strong>
                                </>
                            ) : (
                                <strong>{productCountLabel(state.total)}</strong>
                            )}
                        </p>
                    )}
                    {categoryId && status !== "loading" && state.products.length > 0 && (
                        <button type="button" className={styles.clear} onClick={() => selectCategory(null)}>
                            <X size={15} aria-hidden="true" />
                            Quitar filtro
                        </button>
                    )}
                </div>
            </div>

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
                categoryId ? (
                    <StateMessage
                        title={unknownCategory
                            ? "Esta categoría no está disponible"
                            : `Por ahora no hay productos en ${categoryName ? `"${categoryName}"` : "esta categoría"}`}
                        description="Prueba con otra categoría o mira todos los productos de la tienda."
                        action={showAllButton}
                    />
                ) : (
                    <StateMessage title="No hay productos disponibles en este momento" />
                )
            ) : (
                <>
                    <ul className={styles.grid} aria-label={categoryName ? `Productos de ${categoryName}` : "Productos"}>
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
