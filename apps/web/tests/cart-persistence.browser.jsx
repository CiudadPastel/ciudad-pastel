import { act } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "../src/App";
import { CartProvider } from "../src/cart/CartProvider";
import { CART_STORAGE_KEY } from "../src/utils/cart";
import "../src/index.css";

// Two fresh browser processes/documents share only the isolated test profile's
// localStorage. No React state or in-memory modules survive between the phases.
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const restore = new URLSearchParams(window.location.search).get("phase") === "restore";
const product = { id: "persist", name: "Harina persistida", price: 2500, available: true, imageUrl: null };
window.fetch = async (input, options = {}) => {
    if (options.method && options.method !== "GET") throw new Error("Writes forbidden");
    return new URL(input).pathname.endsWith("/products/persist")
        ? Response.json(product) : Response.json({}, { status: 404 });
};
const root = createRoot(document.getElementById("root"));
try {
    if (!restore) window.localStorage.removeItem(CART_STORAGE_KEY);
    window.history.replaceState({}, "", restore ? "/tienda/carrito" : "/tienda/persist");
    await act(async () => { root.render(<CartProvider><BrowserRouter><App /></BrowserRouter></CartProvider>); });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 50)); });
    if (!restore) {
        const button = document.querySelector('button[aria-label="Agregar al carrito: Harina persistida"]');
        if (!button) throw new Error("Product detail did not load");
        await act(async () => { button.click(); });
    }
    const items = JSON.parse(window.localStorage.getItem(CART_STORAGE_KEY));
    if (items?.[0]?.id !== "persist" || items[0].quantity !== 1) throw new Error("Cart was not persisted/restored");
    if (!document.querySelector('a[aria-label="Carrito: 1 unidades"]')) throw new Error("Restored public counter missing");
    if (restore && !document.getElementById("root").innerText.includes("Harina persistida")) throw new Error("Restored cart line missing");
    document.getElementById("results").textContent = restore ? "PASS cart restored in a fresh browser document" : "PASS cart saved before browser document reload";
    document.body.dataset.testStatus = "passed";
} catch (error) {
    document.getElementById("results").textContent = "FAIL " + error.stack;
    document.body.dataset.testStatus = "failed";
} finally { await act(async () => root.unmount()); }
