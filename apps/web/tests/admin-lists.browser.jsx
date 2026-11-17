import { act } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import CoursesList from "../src/pages/admin/CoursesList";
import CourseDetail from "../src/pages/admin/CourseDetail";
import ProductsList from "../src/pages/admin/ProductsList";
import ProductDetail from "../src/pages/admin/ProductDetail";
import ProductEdit from "../src/pages/admin/ProductEdit";
import EnrollmentRequests from "../src/pages/admin/EnrollmentRequests";
import { auth } from "../src/config/firebase";
import "../src/index.css";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
auth.currentUser = { getIdToken: async () => "admin-list-test" };
const container = document.getElementById("root");
const results = [];
let root, failure = false, empty = false, calls = 0;
const products = Array.from({ length: 45 }, (_, i) => ({
    id: `p-${i}`, name: i === 44 ? "Azúcar glas especial" : `Producto ${i}`,
    price: 100 + i, category: { id: i % 2 ? "harinas" : "azucar", name: i % 2 ? "Harinas" : "Azúcar" },
    available: i % 2 === 0, status: i === 0 ? "withdrawn" : "published",
    createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-01T00:00:00Z"
}));
const courses = products.map((p, i) => ({ ...p, id: `c-${i}`, name: i === 44 ? "Repostería básica" : `Curso ${i}`,
    summary: "Curso de prueba", description: "Descripción del curso", status: i % 2 ? "draft" : "published",
    courseType: i % 2 ? "workshop" : "basic", learningOutcomes: [], requiredMaterials: [] }));
const requests = products.map((p, i) => ({ id: `r-${i}`, fullName: i === 44 ? "Ana María Mora" : `Persona ${i}`,
    idType: "national", idNumber: `1053800${i}`, phone: "88887777", courseId: "c-44", courseName: "Repostería básica",
    status: i % 2 ? "contacted" : "pending", createdAt: i === 44 ? "2026-11-01T05:59:00Z" : "2026-11-02T12:00:00Z" }));
window.fetch = async (input, options = {}) => {
    calls++;
    if (failure) return Response.json({ message: "Test server failure" }, { status: 500 });
    const path = new URL(input).pathname.replace(/^\/api/, "");
    if (options.method === "PUT") return Response.json({ ...products[1], ...JSON.parse(options.body) });
    if (path === "/admin/products") return Response.json(empty ? [] : products);
    if (path === "/admin/courses") return Response.json(empty ? [] : courses);
    if (path === "/admin/enrollment-requests") return Response.json(empty ? [] : requests);
    if (path === "/admin/categories") return Response.json([{ id: "harinas", name: "Harinas" }, { id: "azucar", name: "Azúcar" }]);
    if (path.includes("/products/")) {
        const p = products.find((p) => path.split("/").includes(p.id));
        return Response.json({ ...p, categoryId: p.category.id });
    }
    if (path.includes("/courses/")) return Response.json(courses.find((p) => path.split("/").includes(p.id)));
    return Response.json([]);
};
const routes = <Routes>
    <Route path="/admin/cursos" element={<CoursesList />} />
    <Route path="/admin/cursos/:id" element={<CourseDetail />} />
    <Route path="/admin/productos" element={<ProductsList />} />
    <Route path="/admin/productos/:id" element={<ProductDetail />} />
    <Route path="/admin/productos/:id/editar" element={<ProductEdit />} />
    <Route path="/admin/solicitudes" element={<EnrollmentRequests />} />
</Routes>;
const wait = (ms = 20) => new Promise((resolve) => setTimeout(resolve, ms));
async function settle(fn = () => {}, ms = 20) {
    await act(async () => { await fn(); await wait(ms); });
    await act(async () => { await wait(); });
}
function assert(condition, message) { if (!condition) throw new Error(message); }
const text = () => container.textContent;
async function mount(url) {
    if (root) await settle(() => root.unmount());
    window.history.replaceState({}, "", url);
    root = createRoot(container);
    await settle(() => root.render(<BrowserRouter>{routes}</BrowserRouter>));
}
async function click(label) {
    const el = [...container.querySelectorAll("button,a")].find((el) => el.textContent.replace(/\s+/g, "") === label.replace(/\s+/g, ""));
    assert(el, `Missing action ${label}`);
    await settle(() => el.click());
}
async function search(value, delay = 330) {
    const el = container.querySelector('input[type="search"]');
    await settle(() => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, value);
        el.dispatchEvent(new Event("input", { bubbles: true }));
    }, delay);
    // The URL update commits before the debounce effect starts its timer.
    if (delay > 300) await settle(() => {}, 330);
}
async function select(label, value) {
    const el = [...container.querySelectorAll("label")].find((el) => el.textContent.startsWith(label)).querySelector("select");
    await settle(() => { el.value = value; el.dispatchEvent(new Event("change", { bubbles: true })); });
}
async function editName(value) {
    const el = container.querySelector('input[name="name"]');
    assert(el, "Edit form is loaded");
    await settle(() => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, value);
        el.dispatchEvent(new Event("input", { bubbles: true }));
    });
}
async function test(name, fn) {
    try { await fn(); results.push(`PASS ${name}`); }
    catch (error) { results.push(`FAIL ${name}: ${error.stack}`); }
}

await test("products: full-array partial search, rapid typing, reset, combined filters and sorting", async () => {
    await mount("/admin/productos?pagina=2");
    assert(text().includes("21–40 de 45"), "Second page");
    const reads = calls;
    await search("missing", 1); await search("azucar", 1); await search("azucar glas especial");
    assert(text().includes("1–1 de 1") && text().includes("Azúcar glas especial"), "Finds final item by full name without accents");
    assert(!window.location.search.includes("pagina="), "Search resets page");
    await search("glas");
    assert(text().includes("1–1 de 1"), "Partial name");
    await search("no match"); assert(text().includes("No hay productos con estos filtros"), "No matches");
    await click("Limpiar filtros"); await settle(() => {}, 350);
    await select("Categoría", "azucar"); await select("Disponibilidad", "true"); await click("Publicados22");
    await select("Ordenar por", "price-desc");
    assert(text().includes("1–20 de 22"), "Filters combine");
    assert(container.querySelector("tbody tr").textContent.includes("Azúcar glas especial"), "Price descending");
    await click("Siguiente"); assert(text().includes("21–22 de 22"), "Pagination with filters");
    assert(calls === reads, "Filtering and pagination must not read Firestore again");
    await click("Limpiar filtros"); await settle(() => {}, 350);
    assert(text().includes("1–20 de 45"), "Clear all");
    assert(document.documentElement.scrollWidth <= window.innerWidth, "Responsive width");
});
await test("products: detail, cancellation and successful edit preserve list state", async () => {
    const url = "/admin/productos?estado=published&categoria=harinas&orden=name-asc&pagina=2";
    await mount(url);
    await settle(() => container.querySelector("tbody tr").click());
    await click("Editar");
    await click("Cancelar");
    await click("Volver a productos");
    assert(window.location.pathname + window.location.search === url, "Cancel retains original list");
    await settle(() => container.querySelector('a[aria-label^="Editar"]').click());
    // Edit loads the record first, then the form loads its category options.
    await settle();
    await editName("Harina editada");
    await click("Continuar"); await click("Continuar"); await click("Guardar cambios");
    assert(window.location.pathname + window.location.search === url, "Save retains original list");
});
await test("courses: partial search, combined status/type, alphabetical order and clear", async () => {
    await mount("/admin/cursos?pagina=2");
    await search("reposteria bas");
    assert(text().includes("Repostería básica") && text().includes("1–1 de 1"), "Course outside current page found");
    await select("Tipo de curso", "basic");
    await click("Publicados1");
    assert(text().includes("1–1 de 1"), "Combined course filters");
    await click("Limpiar filtros"); await settle(() => {}, 350);
    await select("Ordenar por", "name-desc");
    assert(container.querySelector("tbody tr").textContent.includes("Repostería básica"), "Alphabetical descending");
    await search("missing"); assert(text().includes("No hay cursos con estos filtros"), "No matches");
});
await test("requests: authorized search, dates in Costa Rica, status and return navigation", async () => {
    await mount("/admin/solicitudes?q=ana+maria&estado=pendientes&curso=c-44&desde=2026-10-31&hasta=2026-10-31");
    assert(text().includes("Ana María Mora") && text().includes("1–1 de 1"), "Search and inclusive local dates combine");
    assert(text().includes("Requiere atención"), "Attention cue");
    const url = window.location.pathname + window.location.search;
    await click("Repostería básica"); await click("Volver a solicitudes");
    assert(window.location.pathname + window.location.search === url, "Request state retained");
    await search("r-44"); assert(text().includes("Ana María Mora"), "Search request ID");
    await search("missing"); assert(text().includes("No hay solicitudes con estos filtros"), "No matches");
    await click("Limpiar filtros"); await settle(() => {}, 350);
    assert(text().includes("1–20 de 45"), "Clear request filters");
    await select("Ordenar por", "created-asc");
    assert(container.querySelector('ul[aria-label="Solicitudes"] li').textContent.includes("Ana María Mora"), "Oldest first");
});
await test("all modules: empty responses, server errors and retry", async () => {
    for (const [path, message] of [["cursos", "Todavía no hay cursos"], ["productos", "Aún no hay productos"], ["solicitudes", "Todavía no hay solicitudes"]]) {
        empty = true; await mount(`/admin/${path}`); assert(text().includes(message), `Empty ${path}`);
        empty = false; failure = true; await mount(`/admin/${path}`); assert(text().includes("No se pudieron cargar"), `Error ${path}`);
        failure = false; await click("Reintentar"); assert(text().includes("1–20 de 45"), `Retry ${path}`);
    }
});
await settle(() => root.unmount());
document.getElementById("results").textContent = results.join("\n");
document.body.dataset.testStatus = results.some((line) => line.startsWith("FAIL")) ? "failed" : "passed";
