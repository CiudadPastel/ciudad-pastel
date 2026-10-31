import { useEffect, useRef, useState } from "react";
import { LoaderCircle, Search, X } from "lucide-react";

import styles from "./SearchBar.module.css";

const MIN_SEARCH_LENGTH = 2;
const SEARCH_DELAY_MS = 350;

function effectiveSearch(text) {
    const trimmed = text.trim();
    return trimmed.length >= MIN_SEARCH_LENGTH ? trimmed : "";
}

/**
 * Barra de búsqueda de la tienda (HU-T03).
 *   value: búsqueda aplicada (la que está en la URL, ?q=)
 *   onSearch(texto): se llama con un pequeño retraso mientras el cliente escribe,
 *     de inmediato con Enter, y con "" al limpiar. Búsquedas de 1 letra = ""
 *   busy: muestra el ícono de carga mientras llegan los resultados
 */
function SearchBar({ value, onSearch, busy = false }) {
    const [text, setText] = useState(value);
    // Último valor que esta barra envió; sirve para distinguir los cambios de la
    // URL hechos desde afuera (botón atrás, "Limpiar búsqueda") de los propios.
    const [sent, setSent] = useState(value);
    const [syncedValue, setSyncedValue] = useState(value);
    const inputRef = useRef(null);

    // Si la búsqueda cambió desde afuera, el texto de la caja se actualiza
    if (value !== syncedValue) {
        setSyncedValue(value);
        if (value !== sent) {
            setText(value);
            setSent(value);
        }
    }

    // Busca automáticamente un momento después de que el cliente deja de escribir
    useEffect(() => {
        const next = effectiveSearch(text);
        if (next === value) return undefined;

        const timer = setTimeout(() => {
            setSent(next);
            onSearch(next);
        }, SEARCH_DELAY_MS);

        return () => clearTimeout(timer);
    }, [text, value, onSearch]);

    function submitNow(event) {
        event.preventDefault();
        const next = effectiveSearch(text);
        if (next !== value) {
            setSent(next);
            onSearch(next);
        }
    }

    function clear() {
        setText("");
        setSent("");
        if (value) onSearch("");
        inputRef.current?.focus();
    }

    const tooShort = text.trim().length > 0 && text.trim().length < MIN_SEARCH_LENGTH;

    return (
        <form role="search" className={styles.form} onSubmit={submitNow}>
            <label htmlFor="store-search" className="sr-only">Buscar productos</label>
            <div className={styles.field}>
                {busy
                    ? <LoaderCircle size={20} className={`${styles.icon} ${styles.spin}`} aria-hidden="true" />
                    : <Search size={20} className={styles.icon} aria-hidden="true" />}
                <input
                    ref={inputRef}
                    id="store-search"
                    type="search"
                    className={styles.input}
                    placeholder="Buscar por nombre o marca, por ejemplo: fondant"
                    value={text}
                    maxLength={100}
                    autoComplete="off"
                    enterKeyHint="search"
                    aria-describedby="store-search-hint"
                    onChange={(event) => setText(event.target.value)}
                    onKeyDown={(event) => {
                        if (event.key === "Escape" && text) {
                            event.preventDefault();
                            clear();
                        }
                    }}
                />
                {text && (
                    <button
                        type="button"
                        className={styles.clear}
                        onClick={clear}
                        aria-label="Limpiar búsqueda"
                        title="Limpiar búsqueda"
                    >
                        <X size={18} aria-hidden="true" />
                    </button>
                )}
            </div>
            <p id="store-search-hint" className={styles.hint} aria-live="polite">
                {tooShort ? "Escribe al menos 2 letras para buscar." : ""}
            </p>
        </form>
    );
}

export default SearchBar;
