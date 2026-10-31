import { useEffect, useState } from "react";
import { ArrowLeft, CircleCheck, CircleX, PackageSearch } from "lucide-react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";

import StateMessage, { RetryButton } from "../../components/ui/StateMessage";
import { getPublicProduct } from "../../services/publicProducts.service";
import { formatPrice } from "../../utils/format";

import styles from "./ProductDetail.module.css";

/**
 * Detalle público de un producto (HU-T02).
 * Se abre desde una tarjeta del catálogo, que manda en el state la URL del
 * catálogo (con su categoría y páginas cargadas) para poder volver al mismo lugar.
 */
function ProductDetail() {
    const { id } = useParams();
    const location = useLocation();
    const navigate = useNavigate();
    const [reloadKey, setReloadKey] = useState(0);
    const [state, setState] = useState({ id: null, key: null, status: "loading", product: null, error: null });

    useEffect(() => {
        let active = true;

        getPublicProduct(id)
            .then((product) => {
                if (active) setState({ id, key: reloadKey, status: "success", product, error: null });
            })
            .catch((error) => {
                if (active) {
                    setState({
                        id,
                        key: reloadKey,
                        status: error.status === 404 ? "unavailable" : "error",
                        product: null,
                        error
                    });
                }
            });

        return () => {
            active = false;
        };
    }, [id, reloadKey]);

    const status = state.id === id && state.key === reloadKey ? state.status : "loading";

    // Si se llegó desde el catálogo, "Volver" regresa a esa misma entrada del
    // historial (misma categoría, mismas páginas y el producto enfocado).
    // Si se abrió con un enlace directo, lleva a la tienda.
    const cameFromCatalog = typeof location.state?.from === "string";
    const backTo = cameFromCatalog ? location.state.from : "/tienda";

    function handleBack(event) {
        if (!cameFromCatalog) return;
        event.preventDefault();
        navigate(-1);
    }

    const backLink = (
        <Link to={backTo} onClick={handleBack} className={styles.back}>
            <ArrowLeft size={16} aria-hidden="true" />
            Volver al catálogo
        </Link>
    );

    if (status === "loading") {
        return (
            <section className={styles.page} aria-busy="true">
                {backLink}
                <div className={styles.layout} role="status" aria-label="Cargando producto">
                    <div className={`${styles.media} ${styles.skeleton}`} />
                    <div className={styles.info} aria-hidden="true">
                        <span className={`${styles.skeleton} ${styles.skeletonChip}`} />
                        <span className={`${styles.skeleton} ${styles.skeletonTitle}`} />
                        <span className={`${styles.skeleton} ${styles.skeletonPrice}`} />
                        <span className={`${styles.skeleton} ${styles.skeletonText}`} />
                        <span className={`${styles.skeleton} ${styles.skeletonText}`} />
                    </div>
                </div>
            </section>
        );
    }

    if (status === "unavailable") {
        return (
            <section className={styles.page}>
                <StateMessage
                    title="Producto no disponible"
                    description="Este producto no existe o ya no está a la venta. Te invitamos a ver los demás productos de la tienda."
                    action={(
                        <Link to={backTo} onClick={handleBack} className="btn btn-primary">
                            <ArrowLeft size={16} aria-hidden="true" />
                            Volver al catálogo
                        </Link>
                    )}
                />
            </section>
        );
    }

    if (status === "error") {
        return (
            <section className={styles.page}>
                {backLink}
                <StateMessage
                    variant="error"
                    title="No se pudo cargar el producto"
                    description={state.error?.message}
                    action={<RetryButton onClick={() => setReloadKey((key) => key + 1)} />}
                />
            </section>
        );
    }

    const { product } = state;
    // La marca va bajo el nombre; aquí solo las medidas
    const specs = [
        ["Peso o contenido", product.weight],
        ["Tamaño", product.size]
    ].filter(([, value]) => value);

    return (
        <article className={styles.page}>
            {backLink}

            <div className={styles.layout}>
                <ProductImage key={product.id} product={product} />

                <div className={styles.info}>
                    {product.category && (
                        <Link
                            to={`/tienda?categoria=${encodeURIComponent(product.category.id)}`}
                            className={styles.category}
                        >
                            {product.category.name}
                        </Link>
                    )}

                    <div>
                        <h1 className={styles.name}>{product.name}</h1>
                        {product.brand && <p className={styles.brand}>{product.brand}</p>}
                    </div>

                    <div className={styles.priceRow}>
                        <p className={styles.price}>{formatPrice(product.price)}</p>
                        {product.available ? (
                            <span className={styles.inStock}>
                                <CircleCheck size={16} aria-hidden="true" />
                                Disponible
                            </span>
                        ) : (
                            <span className={styles.outOfStock}>
                                <CircleX size={16} aria-hidden="true" />
                                Agotado
                            </span>
                        )}
                    </div>

                    {!product.available && (
                        <p className={styles.outOfStockNote}>
                            Por ahora no tenemos este producto en tienda.
                        </p>
                    )}

                    {/* Espacio reservado para el botón "Consultar por WhatsApp" (HU-T05) */}
                    <div className={styles.contactSlot} data-slot="whatsapp" />

                    {specs.length > 0 && (
                        <dl className={styles.specs}>
                            {specs.map(([label, value]) => (
                                <div key={label} className={styles.spec}>
                                    <dt>{label}</dt>
                                    <dd>{value}</dd>
                                </div>
                            ))}
                        </dl>
                    )}

                    <section className={styles.description} aria-labelledby="product-description-title">
                        <h2 id="product-description-title">Descripción</h2>
                        {product.description
                            ? <p>{product.description}</p>
                            : <p className={styles.muted}>Este producto todavía no tiene descripción.</p>}
                    </section>
                </div>
            </div>
        </article>
    );
}

/** Imagen grande, o la imagen por defecto si no tiene foto o la foto no carga. */
function ProductImage({ product }) {
    const [failed, setFailed] = useState(false);

    if (!product.imageUrl || failed) {
        return (
            <div className={`${styles.media} ${styles.placeholder}`} role="img" aria-label={`${product.name}: sin foto`}>
                <PackageSearch size={56} strokeWidth={1.4} aria-hidden="true" />
                <span>Imagen no disponible</span>
            </div>
        );
    }

    return (
        <img
            src={product.imageUrl}
            alt={`Foto de ${product.name}`}
            className={`${styles.media} ${styles.image}`}
            onError={() => setFailed(true)}
        />
    );
}

export default ProductDetail;
