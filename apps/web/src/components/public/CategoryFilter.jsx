import { useEffect, useRef } from "react";
import { Check, LayoutGrid } from "lucide-react";

import styles from "./CategoryFilter.module.css";

/**
 * Selector de categorías de la tienda (HU-T04).
 *   categories: [{ id, name, productCount }] de GET /api/categories
 *   selectedId: id de la categoría elegida o null para "Todos los productos"
 *   totalCount: cantidad total de productos (para el chip "Todos"), opcional
 *   onSelect(id | null)
 *   status: "loading" | "success" | "error"
 *   onRetry(): para volver a cargar las categorías si falló
 */
function CategoryFilter({ categories, selectedId, totalCount, onSelect, status, onRetry }) {
    const barRef = useRef(null);

    // En el celular la fila se desliza de lado: se asegura que la categoría
    // elegida quede a la vista (por ejemplo, al abrir un enlace con ?categoria=).
    useEffect(() => {
        const bar = barRef.current;
        const selected = bar?.querySelector('[aria-pressed="true"]');
        if (!bar || !selected || bar.scrollWidth <= bar.clientWidth) return;
        bar.scrollTo({ left: selected.offsetLeft - (bar.clientWidth - selected.offsetWidth) / 2 });
    }, [selectedId, status, categories]);

    if (status === "loading") {
        return (
            <div className={styles.bar} aria-hidden="true">
                {Array.from({ length: 5 }, (_, index) => (
                    <span key={index} className={styles.skeleton} />
                ))}
            </div>
        );
    }

    if (status === "error") {
        return (
            <p className={styles.error} role="alert">
                No se pudieron cargar las categorías. Puedes seguir viendo todos los productos.
                <button type="button" className={styles.retry} onClick={onRetry}>
                    Reintentar
                </button>
            </p>
        );
    }

    if (categories.length === 0) return null;

    return (
        <nav ref={barRef} className={styles.bar} aria-label="Filtrar productos por categoría">
            <Chip
                label="Todos los productos"
                icon={LayoutGrid}
                count={totalCount}
                selected={selectedId === null}
                onClick={() => onSelect(null)}
            />
            {categories.map((category) => (
                <Chip
                    key={category.id}
                    label={category.name}
                    count={category.productCount}
                    selected={selectedId === category.id}
                    onClick={() => onSelect(category.id)}
                />
            ))}
        </nav>
    );
}

function Chip({ label, count, selected, onClick, icon: Icon }) {
    return (
        <button
            type="button"
            className={`${styles.chip} ${selected ? styles.selected : ""}`}
            aria-pressed={selected}
            onClick={onClick}
        >
            {selected
                ? <Check size={16} aria-hidden="true" className={styles.check} />
                : Icon && <Icon size={16} aria-hidden="true" />}
            <span>{label}</span>
            {Number.isInteger(count) && (
                <span className={styles.count}>
                    {count}
                    <span className="sr-only"> {count === 1 ? "producto" : "productos"}</span>
                </span>
            )}
        </button>
    );
}

export default CategoryFilter;
