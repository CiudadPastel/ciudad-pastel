import { act } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import PublicLayout from "../src/components/public/PublicLayout";
import HomeContent from "../src/pages/admin/HomeContent";
import Home from "../src/pages/Home";
import { CartProvider } from "../src/cart/CartProvider";
import { auth } from "./fixtures/firebase";
import { DEFAULT_HOME_CONTENT } from "../src/services/homeContent.service";
import { getWhatsAppContact, resetWhatsAppContactCache } from "../src/services/contact.service";
import "../src/index.css";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const container = document.getElementById("root");
const results = [];
let root;
let saved = { ...structuredClone(DEFAULT_HOME_CONTENT), revision: 0 };
let writes = [];
let contactRequests = 0;
let contactConfigured = false;
let failSave = false;
const contact = { phone: "+50622223333", messageTemplate: "Hola {{productName}}" };
auth.currentUser = { getIdToken: async () => "test-admin-token" };
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const tick = () => new Promise(resolve => setTimeout(resolve, 20));
async function settle(fn = () => {}) { await act(async () => { await fn(); await tick(); }); }
async function mount(element, path = "/test") {
    if (root) await settle(() => root.unmount());
    history.replaceState({}, "", path);
    root = createRoot(container);
    await settle(() => root.render(<CartProvider><BrowserRouter>{element}</BrowserRouter></CartProvider>));
    await settle();
}
window.fetch = async (input, options = {}) => {
    const path = new URL(input).pathname;
    if (path.endsWith("/contact/whatsapp")) {
        contactRequests++;
        return contactConfigured ? Response.json(contact) : Response.json({}, { status: 404 });
    }
    if (path.endsWith("/site/home")) {
        if (options.method === "PUT") {
            writes.push(options);
            assert(options.headers.Authorization === "Bearer test-admin-token", "Authenticated publication");
            if (failSave) return Response.json({}, { status: 500 });
            const data = options.body instanceof FormData ? JSON.parse(options.body.get("content")) : JSON.parse(options.body);
            if (options.body instanceof FormData) {
                assert(options.body.get("heroImageUrl") instanceof File, "Selected file attached only on save");
                // Serve the browser fixture locally; the API suite verifies HTTPS validation.
                data.heroImageUrl = `${location.origin}/src/assets/logo-ciudad-pastel.png`;
            }
            saved = { ...data, revision: data.revision + 1 };
        }
        return Response.json(saved);
    }
    if (path.endsWith("/courses") || path.endsWith("/categories")) return Response.json([]);
    throw new Error(`Unexpected request ${path}`);
};
async function test(name, fn) {
    try { await fn(); results.push(`PASS ${name}`); }
    catch (error) { results.push(`FAIL ${name}: ${error.stack}`); }
}
const nav = () => container.querySelector('a[aria-label^="Carrito:"]');
await test("cart opens from catalog, product, courses, course detail and other public pages", async () => {
    const paths = ["/tienda?categoria=cacao", "/tienda/cake%201", "/cursos", "/cursos/curso1", "/mis-libros-de-recetas"];
    for (const path of paths) {
        await mount(<Routes><Route element={<PublicLayout />}><Route path="*" element={<div data-product-id="cake">Página pública</div>} /></Route></Routes>, path);
        for (const modifier of ["ctrlKey", "metaKey", "shiftKey", "altKey"]) {
            const event = new MouseEvent("click", { bubbles: true, cancelable: true, button: 0, [modifier]: true });
            // Stop the browser opening a new window after React processes the event.
            let prevented;
            const preventBrowser = e => { prevented = e.defaultPrevented; e.preventDefault(); };
            document.addEventListener("click", preventBrowser, { once: true });
            await settle(() => nav().dispatchEvent(event));
            assert(!prevented && location.pathname !== "/tienda/carrito", `${modifier} retains browser semantics`);
        }
        const middle = new MouseEvent("click", { bubbles: true, cancelable: true, button: 1 });
        let intercepted;
        document.addEventListener("click", e => { intercepted = e.defaultPrevented; e.preventDefault(); }, { once: true });
        await settle(() => nav().dispatchEvent(middle));
        assert(!intercepted, "Middle click not intercepted");
        await settle(() => nav().click());
        assert(location.pathname === "/tienda/carrito", `Cart reached from ${path}`);
        const state = history.state.usr;
        if (path.startsWith("/tienda?")) {
            assert(state.catalogFrom === path && typeof state.catalogScrollY === "number", "Catalog filters and scroll retained");
            assert(state.catalogFocusProductId === "cake", "Visible card focused on return");
        } else if (path.startsWith("/tienda/")) assert(state.catalogFocusProductId === "cake 1", "Decoded detail ID retained");
        else assert(state.catalogScrollY === null && state.catalogFocusProductId === null, "Non-catalog pages have null return position");
    }
});
await test("404 is cached, expires and supports shared explicit retry", async () => {
    resetWhatsAppContactCache(); contactRequests = 0;
    assert(await getWhatsAppContact() === null, "Unconfigured contact");
    await Promise.all(Array.from({ length: 10 }, () => getWhatsAppContact()));
    assert(contactRequests === 1, "Negative cache avoids repeated requests");
    const originalNow = Date.now;
    try {
        Date.now = () => originalNow() + 61_000;
        await getWhatsAppContact();
        assert(contactRequests === 2, "Negative cache expires");
    } finally { Date.now = originalNow; }
    contactConfigured = true;
    const contacts = await Promise.all([getWhatsAppContact({ refresh: true }), getWhatsAppContact({ refresh: true })]);
    assert(contactRequests === 3 && contacts.every(value => value.phone === contact.phone), "Retry coalesces and recovers");
});
async function chooseFile(type = "image/png") {
    const transfer = new DataTransfer();
    transfer.items.add(new File([new Uint8Array([137,80,78,71,13,10,26,10])], "photo.png", { type }));
    const input = container.querySelector('#upload-heroImageUrl');
    input.files = transfer.files;
    await settle(() => input.dispatchEvent(new Event("change", { bubbles: true })));
}
const button = text => [...container.querySelectorAll("button")].find(node => node.textContent.includes(text));
await test("local preview, replacement, discard and invalid selections never upload", async () => {
    await mount(<HomeContent />); writes = [];
    await chooseFile();
    assert(container.querySelector("img").src.startsWith("blob:"), "Local preview");
    await chooseFile();
    assert(writes.length === 0, "Selection and replacement make no writes");
    await settle(() => button("Descartar cambios").click());
    assert(!container.querySelector("img").src.startsWith("blob:"), "Discard resets preview");
    await chooseFile("text/plain");
    assert(container.textContent.includes("Solo JPG"), "Invalid file is rejected locally");
    assert(writes.length === 0, "Discard and invalid file never upload");
});
await test("pasting a URL or clearing an image cancels a pending local file", async () => {
    await mount(<HomeContent />); await chooseFile();
    const input = container.querySelector("#heroImageUrl");
    const nativeSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
    await settle(() => {
        nativeSetter.call(input, "https://example.test/external.jpg");
        input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    assert(!container.querySelector("img").src.startsWith("blob:"), "External URL replaces local selection");
    await settle(() => button("Guardar cambios").click());
    assert(!(writes.at(-1).body instanceof FormData), "URL publication does not upload the previously selected file");
    assert(saved.heroImageUrl === "https://example.test/external.jpg", "External URL persisted");
    await chooseFile();
    await settle(() => button("Quitar imagen").click());
    assert(!container.querySelector("fieldset").querySelector("img"), "Clear discards the pending file preview");
    await settle(() => button("Guardar cambios").click());
    assert(!(writes.at(-1).body instanceof FormData) && saved.heroImageUrl === null, "Clear saves without uploading");
    writes = [];
    await chooseFile();
});
await test("saving publishes in one authenticated request and survives editor/public reload", async () => {
    await chooseFile();
    await settle(() => button("Guardar cambios").click());
    assert(writes.length === 1 && container.textContent.includes("fueron publicados"), "Save publishes");
    await mount(<HomeContent />);
    assert(container.querySelector("#heroImageUrl").value === saved.heroImageUrl, "Editor reload reads published URL");
    await mount(<Home />, "/");
    assert([...container.querySelectorAll('img')].some(image => image.src === saved.heroImageUrl), "Public home reload displays new URL");
});
await test("save failure preserves local selection and reports uncertain publication", async () => {
    await mount(<HomeContent />); await chooseFile(); failSave = true;
    await settle(() => button("Guardar cambios").click());
    assert(container.textContent.includes("No se pudo confirmar"), "Save error explained");
    assert(container.querySelector("img").src.startsWith("blob:"), "Local file retained for review");
    failSave = false;
});
if (root) await settle(() => root.unmount());
auth.currentUser = null;
document.getElementById("results").textContent = results.join("\n");
document.body.dataset.testStatus = results.some(result => result.startsWith("FAIL")) ? "failed" : "passed";
