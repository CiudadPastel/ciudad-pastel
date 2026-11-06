import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CartContext } from "./CartContext";
import { applyCartAction, CART_STORAGE_KEY, decodeCart } from "../utils/cart";
import styles from "./CartProvider.module.css";

function restoreCart() {
    try {
        const result = decodeCart(window.localStorage.getItem(CART_STORAGE_KEY));
        return { items: result.items, storageError: result.invalid ? "Se descartaron datos no válidos del carrito guardado." : "" };
    } catch {
        return { items: [], storageError: "No se pudo leer el carrito guardado. Puede usarlo durante esta sesión." };
    }
}

export function CartProvider({ children }) {
    const [state, setState] = useState(restoreCart);
    const itemsRef = useRef(state.items);
    const [notice, setNotice] = useState("");

    const update = useCallback((action) => {
        const result = applyCartAction(itemsRef.current, action);
        if (result.success === false) {
            setNotice(result.message);
            return result;
        }
        itemsRef.current = result.items;
        let storageError = "";
        try { window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(result.items)); }
        catch { storageError = "No se pudo guardar el carrito en este navegador. Su selección se conserva durante esta sesión."; }
        setState({ items: result.items, storageError });
        if (result.message) setNotice(result.message);
        return result;
    }, []);

    useEffect(() => {
        function receive(event) {
            if (event.key !== CART_STORAGE_KEY && event.key !== null) return;
            const result = decodeCart(event.newValue);
            if (result.invalid) {
                setState((previous) => ({ ...previous, storageError: "Los datos de otra pestaña no son válidos. Conservamos su selección actual." }));
                return;
            }
            itemsRef.current = result.items;
            setState({ items: result.items, storageError: "" });
            setNotice("Carrito actualizado desde otra pestaña.");
        }
        window.addEventListener("storage", receive);
        return () => window.removeEventListener("storage", receive);
    }, []);

    useEffect(() => {
        if (!notice) return;
        const timer = window.setTimeout(() => setNotice(""), 5000);
        return () => window.clearTimeout(timer);
    }, [notice]);

    const refreshProducts = useCallback((results) => update({ type: "refresh", results }), [update]);
    const value = useMemo(() => ({
        items: state.items,
        units: state.items.reduce((sum, item) => sum + item.quantity, 0),
        add: (product) => update({ type: "add", product }),
        setQuantity: (id, quantity) => update({ type: "quantity", id, quantity }),
        remove: (id) => update({ type: "remove", id }),
        clear: () => update({ type: "clear" }),
        refreshProducts
    }), [state.items, update, refreshProducts]);

    return (
        <CartContext.Provider value={value}>
            {children}
            <div className={styles.feedback}>
                {state.storageError && <p role="alert" className={styles.warning}>{state.storageError}</p>}
                <div role="status" aria-live="polite">{notice && <p className={styles.notice}>{notice}</p>}</div>
            </div>
        </CartContext.Provider>
    );
}
