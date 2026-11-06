/* Browser regression tests. All API responses are fixtures; no Firebase writes. */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import CourseForm from "../src/components/admin/CourseForm";
import ProductsList from "../src/pages/public/ProductsList";
import CoursesList from "../src/pages/public/CoursesList";
import { EMPTY_COURSE_FORM } from "../src/utils/courseValidation";
import "../src/index.css";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const container = document.getElementById("root");
const results = [];
let root;
let requests = [];
let failProducts = false;
let failCategories = false;
let pendingProducts;
const courses = Array.from({ length: 25 }, (_, index) => ({
    id: String(index), name: `Curso ${index}`, summary: "Curso de prueba",
    courseType: index < 13 ? "workshop" : "basic", price: 1000
}));

window.fetch = async (input) => {
    const url = new URL(input);
    requests.push(url);
    if (url.pathname.endsWith("/categories")) {
        if (failCategories) throw new Error("offline");
        return Response.json([{ id: "harinas", name: "Harinas", productCount: 13 }]);
    }
    if (url.pathname.endsWith("/products")) {
        if (pendingProducts) await pendingProducts;
        if (failProducts) throw new Error("offline");
        const total = url.searchParams.get("q") ? 0 : url.searchParams.has("categoryId")
            ? url.searchParams.get("categoryId") === "harinas" ? 13 : 0 : 25;
        const page = Number(url.searchParams.get("page"));
        const limit = Number(url.searchParams.get("limit"));
        return Response.json({ total, page, limit, hasMore: page * limit < total,
            items: Array.from({ length: Math.max(0, Math.min(limit, total - (page - 1) * limit)) }, (_, index) => ({
                id: String((page - 1) * limit + index), name: `Producto ${(page - 1) * limit + index}`, price: 1000, available: true
            })) });
    }
    if (url.pathname.endsWith("/courses")) return Response.json(courses);
    return Response.json({});
};

const tick = () => new Promise((resolve) => setTimeout(resolve, 20));
async function settle(fn = () => {}) {
    await act(async () => { await fn(); await tick(); });
    await act(async () => { await tick(); });
}
function assert(condition, message) { if (!condition) throw new Error(message); }
function text() { return container.innerText; }
async function mount(component, url) {
    if (root) await settle(() => root.unmount());
    window.history.replaceState({}, "", url);
    root = createRoot(container);
    await settle(() => root.render(<BrowserRouter>{component}</BrowserRouter>));
}
async function button(label) {
    const element = [...container.querySelectorAll("button")].find((item) => item.textContent.trim() === label);
    assert(element, `Missing button: ${label}`);
    await settle(() => element.click());
}
async function link(label) {
    const element = [...container.querySelectorAll("a")].find((item) => item.textContent.trim() === label);
    assert(element, `Missing link: ${label}`);
    await settle(() => element.click());
}
async function input(name, value) {
    const element = container.querySelector(`[name="${name}"]`);
    const prototype = element.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    await settle(() => {
        Object.getOwnPropertyDescriptor(prototype, "value").set.call(element, value);
        element.dispatchEvent(new Event("input", { bubbles: true }));
    });
}
async function test(name, fn) {
    try { await fn(); results.push(`PASS ${name}`); }
    catch (error) { results.push(`FAIL ${name}: ${error.stack}`); }
}

await test("course stage validation, back navigation, preserved fields and final-only single save", async () => {
    let saves = 0;
    let payload;
    let finishSave;
    const saving = new Promise((resolve) => { finishSave = resolve; });
    await mount(<CourseForm isNew onCancel={() => {}} onSubmit={async (value) => { saves++; payload = value; await saving; }} />, "/admin/cursos/nuevo");
    await button("Siguiente");
    assert(document.activeElement.name === "name", "Invalid first stage must focus name");
    assert(container.querySelector('[aria-current="step"]').textContent.includes("Información"), "Must remain on first stage");
    await input("name", "Curso de prueba");
    await input("summary", "Resumen válido del curso");
    await input("description", "Descripción completa para un curso de prueba.");
    await button("Siguiente");
    assert(saves === 0, "Advancing must not persist");
    assert(document.documentElement.scrollWidth <= window.innerWidth, "Course form must fit mobile width");
    await button("Anterior");
    assert(container.querySelector('[name="name"]').value === "Curso de prueba", "Back must preserve values");
    for (let step = 0; step < 4; step++) await button("Siguiente");
    assert(text().includes("Revisión del curso") || container.querySelector('[aria-label="Revisión del curso"]'), "Review stage required");
    await button("Guardar curso");
    await settle(() => container.querySelector("form").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    assert(saves === 1 && payload.name === "Curso de prueba", "Only one final save");
    finishSave();
    await settle();
});

await test("edit preload, published price validation, deep field link and server errors", async () => {
    const initialValues = { ...EMPTY_COURSE_FORM, name: "Curso existente", summary: "Resumen del curso", description: "Descripción del curso existente." };
    let saves = 0;
    await mount(<CourseForm initialValues={initialValues} requirePrice onCancel={() => {}} onSubmit={async () => {
        saves++;
        throw Object.assign(new Error("Validación del servidor"), { details: ["name must contain at least 3 characters."] });
    }} />, "/admin/cursos/1/editar#course-price");
    assert(document.activeElement.name === "price", "Hash must open planning stage and focus price");
    await button("Siguiente");
    assert(document.activeElement.name === "price" && saves === 0, "Published price required before advance");
    await input("price", "0");
    await button("Siguiente");
    await button("Siguiente");
    await button("Guardar curso");
    assert(document.activeElement.name === "name", "Server error must open and focus its stage");
    assert(container.querySelector('[name="name"]').value === initialValues.name, "Edit preload preserved");
    assert(text().includes("No se pudo guardar"), "Readable error required");
});

await test("content drafts persist across steps and schedule validates before review", async () => {
    await mount(<CourseForm initialValues={{ ...EMPTY_COURSE_FORM, name: "Curso semanal",
        summary: "Resumen del curso semanal", description: "Descripción completa del curso semanal.",
        scheduleType: "weekly" }} onSubmit={async () => {}} onCancel={() => {}} />, "/admin/cursos/nuevo");
    await button("Siguiente");
    const draft = container.querySelector("#course-learningOutcomes");
    await settle(() => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(draft, "Aprender a decorar");
        draft.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await button("Siguiente");
    await button("Anterior");
    assert(draft.value === "Aprender a decorar", "Uncommitted list editor draft must survive navigation");
    await button("Siguiente");
    await button("Siguiente");
    await button("Siguiente");
    assert(document.activeElement.name === "scheduleWeekday", "Schedule errors must block review and receive focus");
    assert(container.querySelector('[aria-current="step"]').textContent.includes("Horario"), "Remain on schedule stage");
});

await test("product categories first, virtual all, filtered incremental totals and browser back", async () => {
    requests = [];
    await mount(<ProductsList />, "/tienda");
    assert(container.querySelector('ul[aria-label="Categorías"] a').textContent === "Ver todos", "All must be the first virtual card");
    assert(!requests.some((url) => url.pathname.endsWith("/products")), "Category landing must not fetch products");
    assert(document.documentElement.scrollWidth <= window.innerWidth, "Category grid must fit mobile width");
    await link("Harinas");
    assert(text().includes("Mostrando 12 de 13 productos"), "Filtered total must be 13");
    assert(requests.filter((url) => url.pathname.endsWith("/products")).every((url) => url.searchParams.get("categoryId") === "harinas"), "API category filter required");
    await button("Cargar más");
    assert(text().includes("Mostrando 13 de 13 productos"), "Final partial page total");
    await button("Volver a categorías");
    await settle(() => window.history.back());
    assert(text().includes("Mostrando 13 de 13 productos"), "Browser back must restore loaded pages");
    await button("Volver a categorías");
    await link("Ver todos");
    assert(text().includes("Mostrando 12 de 25 productos"), "All must remove category filter");
});

await test("product errors, retries, loading and empty search", async () => {
    failCategories = true;
    await mount(<ProductsList />, "/tienda");
    assert(text().includes("No se pudieron cargar las categorías"), "Category error");
    assert(container.querySelector('ul[aria-label="Categorías"] a').textContent === "Ver todos", "All remains usable after category error");
    failCategories = false;
    await button("Reintentar");
    failProducts = true;
    await link("Ver todos");
    assert(text().includes("No se pudieron cargar los productos"), "Product error");
    failProducts = false;
    await button("Reintentar");
    assert(text().includes("Mostrando 12 de 25 productos"), "Retry works");
    await mount(<ProductsList />, "/tienda?q=inexistente");
    assert(text().includes("Mostrando 0 de 0 productos"), "Empty filtered total");
    await mount(<ProductsList />, "/tienda?categoria=desconocida");
    assert(text().includes("Esta categoría no está disponible") && text().includes("Mostrando 0 de 0 productos"), "Unknown category empty state");
    let release;
    pendingProducts = new Promise((resolve) => { release = resolve; });
    await mount(<ProductsList />, "/tienda?categoria=harinas");
    assert(container.querySelector('[aria-label="Cargando productos"]'), "Separate loading state");
    release(); pendingProducts = null;
    await settle();
    assert(text().includes("Mostrando 12 de 13 productos"), "Loading resolves");
});

await test("course type categories, filtered pagination, deep links and empty type", async () => {
    await mount(<CoursesList />, "/cursos");
    assert(container.querySelector('ul[aria-label="Tipos de curso"] a').textContent === "Ver todos", "Virtual all first for courses");
    await link("Taller");
    assert(text().includes("Mostrando 1–12 de 13 cursos"), "Real filtered course total");
    await button("Siguiente");
    assert(text().includes("Mostrando 13–13 de 13 cursos"), "Course last page range");
    assert(container.querySelector('a[href="/cursos/12"]'), "Only last filtered course on page two");
    await mount(<CoursesList />, "/cursos?tipo=workshop&pagina=99");
    assert(text().includes("Mostrando 13–13 de 13 cursos"), "Out-of-range page clamps safely");
    await mount(<CoursesList />, "/cursos?tipo=desconocido");
    assert(text().includes("Mostrando 0 de 0 cursos"), "Unknown type is empty");
});

await test("late incremental response cannot replace a newly selected category", async () => {
    await mount(<ProductsList />, "/tienda?vista=todos");
    let release;
    pendingProducts = new Promise((resolve) => { release = resolve; });
    await button("Cargar más");
    assert(text().includes("Cargando más productos"), "Incremental loading is independent");
    await button("Volver a categorías");
    pendingProducts = null;
    await link("Harinas");
    release();
    await settle();
    assert(window.location.search.includes("categoria=harinas"), "Late response must not modify new URL");
    assert(text().includes("Mostrando 12 de 13 productos"), "Late response must not replace filtered results");
    failProducts = true;
    await button("Cargar más");
    assert(text().includes("No se pudieron cargar más productos"), "Incremental error is retryable");
    assert(text().includes("Mostrando 12 de 13 productos"), "Keep current count on incremental failure");
    failProducts = false;
    await button("Reintentar");
    assert(text().includes("Mostrando 13 de 13 productos"), "Incremental retry uses filtered total");
});

await settle(() => root.unmount());
document.getElementById("results").textContent = results.join("\n");
document.body.dataset.testStatus = results.some((result) => result.startsWith("FAIL")) ? "failed" : "passed";
