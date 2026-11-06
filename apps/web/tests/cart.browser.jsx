/* Real components/routes with simulated HTTP and browser-local storage only. */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "../src/App";
import { CartProvider } from "../src/cart/CartProvider";
import WhatsAppButton from "../src/components/public/WhatsAppButton";
import { resetWhatsAppContactCache } from "../src/services/contact.service";
import { CART_STORAGE_KEY } from "../src/utils/cart";
import { formatPrice } from "../src/utils/format";
import "../src/index.css";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const container = document.getElementById("root");
const results = [];
const contact = { phone: "+50622223333", messageTemplate: "Consulta genérica: {{productName}}." };
const products = Array.from({ length: 25 }, (_, index) => ({
    id: `p${index}`, name: index === 0 ? "Harina & cacao 🍰" : `Producto ${index}`, price: 1000 + index,
    available: index !== 1, imageUrl: null
}));
let root;
let requests;
let unavailable;
let failed;
let overrides;
let contactAvailable;
let writes;
let delayed;
let categories;
let categoryResponse;

function assert(condition, message) { if (!condition) throw new Error(message); }
function text() { return container.innerText; }
const tick = () => new Promise((resolve) => window.setTimeout(resolve, 20));
async function settle(fn = () => {}) {
    await act(async () => { await fn(); await tick(); });
    await act(async () => { await tick(); });
}
window.fetch = async (input, options = {}) => {
    const url = new URL(input);
    requests.push(url);
    if (options.method && options.method !== "GET") { writes++; throw new Error("Writes forbidden in public cart tests"); }
    if (url.pathname.endsWith("/contact/whatsapp")) return contactAvailable ? Response.json(contact) : Response.json({}, { status: 404 });
    if (url.pathname.endsWith("/categories")) {
        if (categoryResponse) await categoryResponse;
        return Response.json(categories);
    }
    if (url.pathname.endsWith("/products")) {
        const total = url.searchParams.get("q") === "vacio" ? 0 : 25;
        const page = Number(url.searchParams.get("page")) || 1;
        return Response.json({ items: products.slice((page - 1) * 12, Math.min(page * 12, total)), total, page, limit: 12, hasMore: page * 12 < total });
    }
    const id = decodeURIComponent(url.pathname.split("/").at(-1));
    if (url.pathname.includes("/products/")) {
        if (delayed) await delayed;
        if (failed.has(id)) throw new Error("offline");
        if (unavailable.has(id)) return Response.json({}, { status: 404 });
        return Response.json(overrides.get(id) || products.find((product) => product.id === id) || {}, { status: products.some((product) => product.id === id) ? 200 : 404 });
    }
    throw new Error("Unexpected endpoint " + url.pathname);
};

async function mount(url, component = <App />) {
    if (root) await settle(() => root.unmount());
    window.history.replaceState({}, "", url);
    root = createRoot(container);
    await settle(() => root.render(<CartProvider><BrowserRouter>{component}</BrowserRouter></CartProvider>));
}
async function click(element) { assert(element, "Missing interactive element"); await settle(() => element.click()); }
async function button(label) {
    await click([...container.querySelectorAll("button")].find((element) => element.textContent.trim() === label));
}
async function labeled(label) { await click([...container.querySelectorAll("button")].find((element) => element.getAttribute("aria-label") === label)); }
async function link(label) { await click([...container.querySelectorAll("a")].find((element) => element.textContent.trim() === label)); }
function units(count) { assert(container.querySelector(`a[aria-label="Carrito: ${count} unidades"]`), `Expected ${count} units in public nav`); }
function saved() { return JSON.parse(window.localStorage.getItem(CART_STORAGE_KEY)); }
function seed(items) { window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items)); }
function line(product = products[0], quantity = 1) { return { ...product, quantity }; }
async function test(name, fn) {
    try {
        if (root) { await settle(() => root.unmount()); root = null; }
        window.localStorage.clear();
        requests = []; unavailable = new Set(); failed = new Set(); overrides = new Map();
        contactAvailable = true; writes = 0; delayed = null;
        categories = [{ id: "harinas", name: "Harinas", productCount: 25 }]; categoryResponse = null;
        resetWhatsAppContactCache();
        await fn();
        assert(writes === 0, "Public flow must not write to an API/Firestore");
        results.push(`PASS ${name}`);
    } catch (error) { results.push(`FAIL ${name}: ${error.stack}`); }
}

await test("catalog add, repeat, counter, filters, loaded blocks and scroll", async () => {
    await mount("/tienda?categoria=harinas&q=harina&pagina=2");
    assert(text().includes("Mostrando 24 de 25 productos"), "Catalog blocks restored");
    const beforeUrl = window.location.href;
    const add = container.querySelector('button[aria-label="Agregar al carrito: Producto 12"]');
    await settle(() => add.scrollIntoView({ block: "center" }));
    const scroll = window.scrollY;
    await click(add);
    await click(add);
    units(2);
    assert(window.location.href === beforeUrl && Math.abs(window.scrollY - scroll) <= 1, "Adding preserves URL/scroll");
    assert(saved().length === 1 && saved()[0].id === "p12" && saved()[0].quantity === 2, "Repeated ID increments");
    assert(text().includes("2 unidades en el carrito"), "Accessible visible feedback");
    assert(!container.querySelector("a button, button a"), "No nested interactive elements");
    await click(container.querySelector('a[href="/tienda/carrito"]'));
    assert(text().includes("Carrito de consultas"), "Static cart route beats product :id");
    assert(document.activeElement === container.querySelector("h1"), "Cart entry focuses its heading");
    assert(!requests.some((url) => url.pathname.endsWith("/products/carrito")), "Cart not treated as product ID");
    await link("Seguir explorando productos");
    assert(window.location.search.includes("categoria=harinas") && window.location.search.includes("pagina=2"), "Return preserves catalog context");
    assert(Math.abs(window.scrollY - scroll) <= 1, "Cart return restores actual catalog scroll");
});

await test("category landing restores real scroll after cart return without fetching product pages", async () => {
    categories = Array.from({ length: 30 }, (_, index) => ({ id: `category-${index}`, name: `Categoría ${index}`, productCount: 1 }));
    seed([line()]);
    await mount("/tienda");
    await settle(() => window.scrollTo(0, 500));
    const scroll = window.scrollY;
    assert(scroll > 0, "Category grid is actually scrolled");
    await click(container.querySelector('a[href="/tienda/carrito"]'));
    assert(window.location.pathname === "/tienda/carrito", "Cart opens from category landing");
    let release;
    categoryResponse = new Promise((resolve) => { release = resolve; });
    await link("Seguir explorando productos");
    assert(text().includes("Cargando categorías"), "Return waits for categories, not products");
    release(); categoryResponse = null;
    await settle();
    assert(window.location.pathname === "/tienda" && !window.location.search, "Category landing URL restored");
    assert(container.querySelectorAll('ul[aria-label="Categorías"] a').length === 31, "Category grid has finished rendering");
    assert(Math.abs(window.scrollY - scroll) <= 1, "Category landing restores actual scroll");
    assert(!requests.some((url) => url.pathname.endsWith("/products")), "No product pages downloaded for category landing");
});

await test("product detail add and back retain selection and catalog filters", async () => {
    await mount("/tienda?categoria=harinas&pagina=2");
    await click(container.querySelector('[data-product-id="p12"]'));
    assert(window.location.pathname === "/tienda/p12", "Real product detail opens");
    await labeled("Agregar al carrito: Producto 12");
    units(1);
    assert(window.location.pathname === "/tienda/p12", "Add does not navigate");
    await link("Volver al catálogo");
    assert(window.location.search.includes("pagina=2") && text().includes("Mostrando 24 de 25"), "Detail back restores blocks/filter");
    units(1);
});

await test("persistence across application reload and manual quantities/removal", async () => {
    await mount("/tienda/p0");
    await labeled(`Agregar al carrito: ${products[0].name}`);
    await mount("/tienda/carrito"); // A new React tree reads persisted storage, as a document reload does.
    units(1);
    await click(container.querySelector("li h2 a"));
    await link("Volver al carrito");
    units(1);
    const before = requests.length;
    await labeled(`Aumentar cantidad de ${products[0].name}`);
    units(2);
    assert(requests.length === before, "Quantity changes do not revalidate per render");
    const input = container.querySelector('input[type="number"]');
    await settle(() => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(input, "0");
        input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    assert(saved()[0].quantity === 2 && text().includes("cantidad entera"), "Zero rejected without deleting");
    await labeled(`Disminuir cantidad de ${products[0].name}`);
    units(1);
    await labeled(`Eliminar ${products[0].name}`);
    units(0);
    assert(text().includes("Tu carrito está vacío") && !text().includes("Consultar disponibilidad por WhatsApp"), "Empty has no inquiry action");
});

await test("corrupt storage, blocked reads/writes and cross-tab synchronization", async () => {
    window.localStorage.setItem(CART_STORAGE_KEY, "{bad-json");
    await mount("/tienda/carrito");
    assert(text().includes("Tu carrito está vacío"), "Corrupt data recovers");
    const originalGet = Storage.prototype.getItem;
    const originalSet = Storage.prototype.setItem;
    try {
        Storage.prototype.getItem = () => { throw new Error("blocked"); };
        Storage.prototype.setItem = () => { throw new Error("blocked"); };
        await mount("/tienda/p0");
        await labeled(`Agregar al carrito: ${products[0].name}`);
        units(1);
        assert(text().includes("durante esta sesión"), "Storage failure preserves in-memory cart");
    } finally { Storage.prototype.getItem = originalGet; Storage.prototype.setItem = originalSet; }
    await settle(() => window.dispatchEvent(new StorageEvent("storage", { key: CART_STORAGE_KEY, newValue: JSON.stringify([line(products[1], 3)]) })));
    units(3);
    await settle(() => window.dispatchEvent(new StorageEvent("storage", { key: CART_STORAGE_KEY, newValue: "bad" })));
    units(3);
    assert(text().includes("Conservamos su selección"), "Corrupt cross-tab data does not destroy cart");
});

await test("empty cart, explicit clear confirmation and cancellation", async () => {
    seed([line()]);
    await mount("/tienda/carrito");
    await button("Vaciar carrito");
    await button("Cancelar");
    units(1);
    await button("Vaciar carrito");
    await button("Sí, vaciar carrito");
    units(0);
    assert(text().includes("Tu carrito está vacío") && saved().length === 0, "Clear is explicit and persisted");
});

await test("individual modal identification, cancel, native focus containment and Escape cancel event", async () => {
    seed([line(products[1], 3)]);
    await mount("/tienda/p0");
    const trigger = container.querySelector('button[aria-label^="Consultar por WhatsApp sobre"]');
    await click(trigger);
    const dialog = container.querySelector("dialog[open]");
    assert(dialog && dialog.getAttribute("aria-modal") === "true" && dialog.textContent.includes(products[0].name), "Labeled modal identifies product");
    assert(dialog.querySelector("h2").textContent === "¿Necesitas algún otro producto?", "Expected title");
    await settle(() => container.querySelector('a[href="/tienda/carrito"]').focus());
    assert(dialog.contains(document.activeElement), "Native modal prevents background focus");
    await settle(() => dialog.dispatchEvent(new Event("cancel", { cancelable: true })));
    assert(!dialog.open && document.activeElement === trigger, "Escape's cancel event closes and restores trigger focus");
    assert(saved().length === 1 && saved()[0].quantity === 3, "Cancel does not modify cart");
    await click(trigger);
    await button("Cancelar");
    assert(!dialog.open && document.activeElement === trigger, "Cancel button closes and restores focus");
});

await test("modal add and direct individual inquiry leave unrelated cart items intact", async () => {
    seed([line(products[1], 3)]);
    await mount("/tienda/p0");
    await labeled(`Consultar por WhatsApp sobre ${products[0].name}`);
    const direct = container.querySelector('dialog a[target="_blank"]');
    const url = new URL(direct.href);
    const message = url.searchParams.get("text");
    assert(url.pathname === "/50622223333" && message.includes(`${products[0].name} (1 unidad)`), "Configured phone and encoded individual message");
    assert(!message.includes(products[1].name) && !/precio|cotiz/i.test(message), "Individual ignores other cart products and prices");
    await settle(() => direct.addEventListener("click", (event) => event.preventDefault(), { once: true }));
    await click(direct);
    units(3);
    assert(!container.querySelector("dialog[open]") && saved().length === 1, "Opening individual query preserves cart");
    await labeled(`Consultar por WhatsApp sobre ${products[0].name}`);
    await button("Agregar al carrito y seguir explorando");
    units(4);
    assert(window.location.pathname === "/tienda/p0" && saved().length === 2, "Modal add stays on detail");
});

await test("modal keeps rejection accessible at twenty products and closes only after successful retry", async () => {
    const full = products.slice(0, 20).map((product) => line(product));
    seed(full);
    await mount("/tienda/p20");
    await labeled("Consultar por WhatsApp sobre Producto 20");
    const dialog = container.querySelector("dialog[open]");
    const before = JSON.stringify(saved());
    await button("Agregar al carrito y seguir explorando");
    assert(dialog.open && dialog.contains(document.activeElement), "Rejected add keeps modal and focus inside");
    assert(dialog.querySelector('[role="alert"]').textContent.includes("20 productos distintos"), "Limit reason announced inside modal");
    assert(JSON.stringify(saved()) === before, "Rejected distinct product does not alter cart");
    units(20);
    await settle(() => window.dispatchEvent(new StorageEvent("storage", { key: CART_STORAGE_KEY, newValue: JSON.stringify(full.slice(0, 19)) })));
    units(19);
    await button("Agregar al carrito y seguir explorando");
    assert(!dialog.open, "Successful retry closes the modal");
    units(20);
    assert(saved().length === 20 && saved().some((item) => item.id === "p20" && item.quantity === 1), "Retry uses current shared cart");
});

await test("modal rejects ninety-nine units without closing or incrementing and can retry", async () => {
    seed([line(products[0], 99)]);
    await mount("/tienda/p0");
    await labeled(`Consultar por WhatsApp sobre ${products[0].name}`);
    const dialog = container.querySelector("dialog[open]");
    const before = JSON.stringify(saved());
    await button("Agregar al carrito y seguir explorando");
    assert(dialog.open && dialog.contains(document.activeElement), "Quantity rejection leaves modal open and focus contained");
    assert(dialog.querySelector('[role="alert"]').textContent.includes("99 unidades"), "Quantity limit announced inside modal");
    assert(JSON.stringify(saved()) === before && saved()[0].quantity === 99, "Rejected increment keeps cart intact");
    units(99);
    await settle(() => window.dispatchEvent(new StorageEvent("storage", { key: CART_STORAGE_KEY, newValue: JSON.stringify([line(products[0], 98)]) })));
    units(98);
    await button("Agregar al carrito y seguir explorando");
    assert(!dialog.open && saved()[0].quantity === 99, "Retry succeeds with available quantity capacity");
    units(99);
});

await test("single cart line prepares a singular inquiry with actual quantity", async () => {
    for (const quantity of [1, 4]) {
        seed([line(products[0], quantity)]);
        await mount("/tienda/carrito");
        await button("Consultar disponibilidad por WhatsApp");
        const anchor = [...container.querySelectorAll("a")].find((element) => element.textContent === "Abrir WhatsApp con la consulta");
        const message = new URL(anchor.href).searchParams.get("text");
        assert(message.includes(`${products[0].name} (${quantity} ${quantity === 1 ? "unidad" : "unidades"})`), "Single product uses actual cart quantity");
        assert(message.includes("si está disponible") && !message.includes("los siguientes productos"), "Single-product inquiry is natural");
        assert(!/precio|cotiz|reservad|pedido/i.test(message), "Single-cart inquiry only asks availability");
    }
});

await test("joint inquiry revalidates current data and never empties or sends automatically", async () => {
    seed([line(products[0], 2), line(products[1], 3)]);
    overrides.set("p0", { ...products[0], price: 2000 });
    await mount("/tienda/carrito");
    assert(text().includes(formatPrice(2000)), "Stored price updated on cart entry");
    assert(text().includes("Publicado como agotado"), "Out-of-stock can still be queried");
    const before = requests.filter((url) => url.pathname.includes("/products/")).length;
    overrides.set("p0", { ...products[0], price: 3000 });
    await button("Consultar disponibilidad por WhatsApp");
    assert(requests.filter((url) => url.pathname.includes("/products/")).length === before + 2, "Fresh verification before preparing");
    assert(text().includes(formatPrice(9003)), "Fresh prices affect reference subtotal immediately before inquiry");
    const anchor = [...container.querySelectorAll("a")].find((element) => element.textContent === "Abrir WhatsApp con la consulta");
    const url = new URL(anchor.href);
    const message = url.searchParams.get("text");
    assert(message.includes(`- 2 × ${products[0].name}\n- 3 × ${products[1].name}`), "Joint message uses real selected quantities");
    assert(!/precio|cotiz|reservad|pedido/i.test(message), "Message only asks availability");
    await settle(() => anchor.addEventListener("click", (event) => event.preventDefault(), { once: true }));
    await click(anchor);
    units(5);
    assert(saved().length === 2 && !text().includes("Consulta enviada"), "Opening does not clear or claim sent");
    await labeled(`Aumentar cantidad de ${products[0].name}`);
    assert(!text().includes("Abrir WhatsApp con la consulta"), "Quantity change invalidates prepared message");
});

await test("removed product and offline verification preserve cart and allow recovery", async () => {
    seed([line(products[0]), line(products[1])]);
    unavailable.add("p0"); failed.add("p1");
    await mount("/tienda/carrito");
    assert(text().includes("ya no está disponible en el catálogo público") && text().includes("No se pudo verificar este producto"), "Distinct removed/offline statuses");
    assert(saved().length === 2, "Failures do not destroy selection");
    const primary = [...container.querySelectorAll("button")].find((element) => element.textContent === "Consultar disponibilidad por WhatsApp");
    assert(primary.disabled, "No stale inquiry while verification fails");
    await labeled(`Eliminar ${products[0].name}`);
    failed.clear();
    await button("Reintentar verificación");
    await button("Consultar disponibilidad por WhatsApp");
    assert(text().includes("Tu consulta está preparada"), "Recovery after explicit removal/retry");
});

await test("missing WhatsApp contact is understandable and retryable", async () => {
    seed([line()]); contactAvailable = false;
    await mount("/tienda/carrito");
    assert(text().includes("WhatsApp no está disponible"), "Unavailable contact explained");
    assert(!container.querySelector('a[href^="https://wa.me/"]'), "No invalid WhatsApp link");
    contactAvailable = true;
    await button("Reintentar contacto");
    await button("Consultar disponibilidad por WhatsApp");
    assert(text().includes("Abrir WhatsApp con la consulta"), "Retry loads configured contact");
});

await test("product withdrawn after cart entry blocks a stale prepared inquiry", async () => {
    seed([line()]);
    await mount("/tienda/carrito");
    unavailable.add("p0");
    await button("Consultar disponibilidad por WhatsApp");
    assert(text().includes("ya no está disponible en el catálogo público"), "Withdrawal discovered by final validation");
    assert(!container.querySelector('a[href^="https://wa.me/"]'), "No stale link after withdrawal");
    assert(saved().length === 1, "Withdrawn line is retained for explicit removal");
});

await test("long URL fallback preserves complete message and responsive layout", async () => {
    const longItems = products.slice(0, 20).map((product, index) => line({ ...product, name: `${index} ${"Decoración ".repeat(9)}` }, 99));
    for (const item of longItems) overrides.set(item.id, item);
    seed(longItems);
    await mount("/tienda/carrito");
    // The bounded validation queue needs several rounds to finish for twenty products.
    for (let i = 0; i < 4; i++) await settle();
    await button("Consultar disponibilidad por WhatsApp");
    for (let i = 0; i < 4; i++) await settle();
    const message = container.querySelector('textarea[readonly]');
    assert(text().includes("demasiado larga") && message, "Controlled long-message alternative");
    assert(message.value.includes(longItems[0].name.trim()) && message.value.includes(longItems[19].name.trim()), "No truncation of selection");
    const chat = [...container.querySelectorAll("a")].find((element) => element.textContent === "Abrir chat sin mensaje");
    assert(chat.href === "https://wa.me/50622223333", "Fallback uses configured phone and no oversized query");
    assert(document.documentElement.scrollWidth <= window.innerWidth, "Cart fits mobile/desktop width");
});

await test("generic empty-search WhatsApp keeps template without a product modal", async () => {
    await mount("/tienda?q=vacio");
    const generic = [...container.querySelectorAll("a")].find((element) => element.textContent.includes("Pregúntanos por WhatsApp"));
    assert(generic && new URL(generic.href).searchParams.get("text") === "Consulta genérica: vacio.", "Existing generic configured template");
    assert(!container.querySelector("dialog[open]"), "No product modal for generic search");
    await mount("/test", <WhatsAppButton contact={null} productName="genérico" />);
    assert(!container.querySelector('a[href^="https://wa.me/"]'), "Legacy absent-contact button remains hidden");
});

if (root) await settle(() => root.unmount());
window.localStorage.clear();
document.getElementById("results").textContent = results.join("\n");
document.body.dataset.testStatus = results.some((result) => result.startsWith("FAIL")) ? "failed" : "passed";
