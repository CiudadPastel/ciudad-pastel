/* Browser regression tests. All API responses are fixtures; no Firebase writes. */
import { CartProvider } from "../src/cart/CartProvider";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import CourseForm from "../src/components/admin/CourseForm";
import AdminCoursesList from "../src/pages/admin/CoursesList";
import AdminCourseDetail from "../src/pages/admin/CourseDetail";
import AdminCourseEdit from "../src/pages/admin/CourseEdit";
import ProductsList from "../src/pages/public/ProductsList";
import CoursesList from "../src/pages/public/CoursesList";
import PublicLayout from "../src/components/public/PublicLayout";
import CourseDetail from "../src/pages/public/CourseDetail";
import ProductCreate from "../src/pages/admin/ProductCreate";
import { auth } from "../src/config/firebase";
import { EMPTY_COURSE_FORM, toCoursePayload } from "../src/utils/courseValidation";
import { formatPrice } from "../src/utils/format";
import { formatScheduleSummary } from "../src/utils/schedule";
import "../src/index.css";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const container = document.getElementById("root");
const results = [];
let root;
let requests = [];
let failProducts = false;
let singleProductResult = false;
let failCategories = false;
let pendingProducts;
let pendingCourses;
let failCourses = false;
let seasonalCourses = [];
let includeSeasonalInCatalog = false;
let pendingSeasonalCourses;
let failSeasonalCourses = false;
let adminSeasonName = "Navidad";
let failSeasonWithdrawal = false;
let seasonalWithdrawals = [];
let productWrites = [];
const adminSeasonCourse = {
    id: "admin-seasonal",
    name: "Queque navideño",
    summary: "Curso especial de Navidad",
    description: "Aprenda a preparar un queque navideño.",
    imageUrl: null,
    learningOutcomes: [],
    requiredMaterials: [],
    courseType: "workshop",
    seasonName: adminSeasonName,
    capacity: 6,
    price: 25000,
    instructor: "Yamilena",
    schedule: null,
    status: "draft",
    createdAt: "2026-10-01T10:00:00.000Z",
    updatedAt: "2026-10-01T10:00:00.000Z"
};
const regularAdminCourse = {
    ...adminSeasonCourse,
    id: "admin-regular",
    name: "Curso regular",
    seasonName: null
};
const adminCourseRoutes = <Routes>
    <Route path="/admin/cursos" element={<AdminCoursesList />} />
    <Route path="/admin/cursos/:id" element={<AdminCourseDetail />} />
    <Route path="/admin/cursos/:id/editar" element={<AdminCourseEdit />} />
</Routes>;
const courses = Array.from({ length: 85 }, (_, index) => ({
    id: String(index), name: `Curso ${index}`, summary: "Curso de prueba",
    courseType: index < 13 ? "workshop" : index < 79 ? "basic"
        : ["demonstrative", "semi_demonstrative", "multi_week", "other", null, null][index - 79], price: 1000
}));
const seasonalCourse = {
    id: "seasonal-course",
    name: "Galletas decoradas",
    summary: "Decoración especial para Navidad.",
    description: "Aprenda a decorar galletas para Navidad.",
    imageUrl: "/tests/seasonal-course.png",
    courseType: "workshop",
    seasonName: "Navidad",
    price: 15000,
    capacity: 8,
    remainingSpots: 8,
    learningOutcomes: [],
    requiredMaterials: [],
    schedule: {
        startDate: "2026-12-01",
        endDate: "2026-12-01",
        startTime: "09:00",
        endTime: "12:00",
        frequency: "single",
        weekday: null,
        scheduleNote: null
    }
};

window.fetch = async (input, options = {}) => {
    const url = new URL(input);
    requests.push(url);
    if (url.pathname.endsWith("/admin/products") && options.method === "POST") {
        productWrites.push(JSON.parse(options.body));
        assert(options.headers.Authorization === "Bearer ux-test-token", "Product creation keeps the auth requirement");
        return Response.json({ id: "created-product" }, { status: 201 });
    }
    if (url.pathname.endsWith("/categories")) {
        if (failCategories) throw new Error("offline");
        return Response.json([{ id: "harinas", name: "Harinas", productCount: 13 }]);
    }
    if (url.pathname.endsWith("/admin/courses/admin-seasonal/seasonal") && options.method === "DELETE") {
        seasonalWithdrawals.push(url.pathname);
        if (failSeasonWithdrawal) {
            return Response.json({ message: "Seasonal withdrawal failed." }, { status: 500 });
        }
        adminSeasonName = null;
        return new Response(null, { status: 204 });
    }
    if (url.pathname.endsWith("/admin/courses/admin-seasonal/recipe-books")) {
        return Response.json([]);
    }
    if (url.pathname.endsWith("/admin/courses/admin-seasonal/enrollments")) {
        return Response.json([]);
    }
    if (url.pathname.endsWith("/admin/courses/admin-seasonal")) {
        return Response.json({ ...adminSeasonCourse, seasonName: adminSeasonName });
    }
    if (url.pathname.endsWith("/admin/courses")) {
        return Response.json([
            { ...adminSeasonCourse, seasonName: adminSeasonName },
            regularAdminCourse
        ]);
    }
    if (url.pathname.endsWith("/products")) {
        if (pendingProducts) await pendingProducts;
        if (failProducts) throw new Error("offline");
        const total = singleProductResult ? 1 : url.searchParams.get("q") ? 0 : url.searchParams.has("categoryId")
            ? url.searchParams.get("categoryId") === "harinas" ? 13 : 0 : 25;
        const page = Number(url.searchParams.get("page"));
        const limit = Number(url.searchParams.get("limit"));
        return Response.json({ total, page, limit, hasMore: page * limit < total,
            items: Array.from({ length: Math.max(0, Math.min(limit, total - (page - 1) * limit)) }, (_, index) => ({
                id: String((page - 1) * limit + index), name: `Producto ${(page - 1) * limit + index}`, price: 1000, available: true
            })) });
    }
    if (url.pathname.endsWith("/courses/seasonal")) {
        if (pendingSeasonalCourses) await pendingSeasonalCourses;
        if (failSeasonalCourses) throw new Error("offline");
        return Response.json(seasonalCourses);
    }
    if (url.pathname.endsWith("/courses")) {
        if (pendingCourses) await pendingCourses;
        if (failCourses) throw new Error("offline");
        return Response.json(includeSeasonalInCatalog ? [...courses, seasonalCourse] : courses);
    }
    if (/\/courses\/[^/]+$/.test(url.pathname)) {
        const availableCourses = includeSeasonalInCatalog ? [...courses, seasonalCourse] : courses;
        return Response.json(availableCourses.find((course) => course.id === url.pathname.split("/").at(-1)));
    }
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
    await settle(() => root.render(<CartProvider><BrowserRouter>{component}</BrowserRouter></CartProvider>));
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
async function select(element, value) {
    await settle(() => {
        element.value = value;
        element.dispatchEvent(new Event("change", { bubbles: true }));
    });
}
const courseRoutes = <Routes>
    <Route element={<PublicLayout />}>
        <Route path="/cursos" element={<CoursesList />} />
        <Route path="/cursos/:id" element={<CourseDetail />} />
    </Route>
</Routes>;
async function test(name, fn) {
    try { await fn(); results.push(`PASS ${name}`); }
    catch (error) { results.push(`FAIL ${name}: ${error.stack}`); }
}

await test("product creation keeps shared progress, validation, back navigation and final payload", async () => {
    const previousUser = auth.currentUser;
    auth.currentUser = { getIdToken: async () => "ux-test-token" };
    productWrites = [];
    try {
        await mount(<Routes>
            <Route path="/admin/productos/nuevo" element={<ProductCreate />} />
            <Route path="/admin/productos" element={<p>Producto guardado</p>} />
        </Routes>, "/admin/productos/nuevo");
        assert(container.querySelectorAll('ol[aria-label="Pasos del producto"] li').length === 3, "Product still has three shared progress steps");
        await button("Continuar");
        assert(document.activeElement.name === "name", "Required product name blocks advance");
        await input("name", "Harina de prueba");
        await button("Continuar");
        assert(document.activeElement.name === "categoryId", "Category required");
        await select(container.querySelector('[name="categoryId"]'), "harinas");
        await button("Continuar");
        assert(container.querySelector('[aria-current="step"]').textContent.includes("Detalles"), "Shared progress advances to details");
        await input("brand", "Marca de prueba");
        await button("Anterior");
        assert(container.querySelector('[name="name"]').value === "Harina de prueba", "Product name retained");
        assert(container.querySelector('[name="categoryId"]').value === "harinas", "Product category retained");
        await button("Continuar");
        assert(container.querySelector('[name="brand"]').value === "Marca de prueba", "Product details retained");
        await button("Continuar");
        assert(productWrites.length === 0, "Product not saved on step changes");
        await button("Guardar producto");
        assert(document.activeElement.name === "price", "Price validates on final stage");
        await input("price", "1.5");
        await button("Guardar producto");
        assert(productWrites.length === 0, "Fractional price rejected");
        await input("price", "2500");
        await button("Guardar producto");
        assert(productWrites.length === 1, "One final product write");
        assert(JSON.stringify(productWrites[0]) === JSON.stringify({
            name: "Harina de prueba", brand: "Marca de prueba", description: null, weight: null,
            size: null, price: 2500, categoryId: "harinas", imageUrl: null, available: true
        }), "Product payload contract unchanged");
        assert(window.location.pathname === "/admin/productos" && text().includes("Producto guardado"), "Product creation navigates on success");
    } finally { auth.currentUser = previousUser; }
});

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

await test("course review displays full saved data and edit links preserve final payload", async () => {
    const values = {
        ...EMPTY_COURSE_FORM, name: "Curso completo", courseType: "basic", summary: "Resumen del curso completo",
        description: "Descripción completa del curso que se va a guardar.", imageUrl: window.location.origin + "/tests/course.png",
        learningOutcomes: ["Preparar bizcochos", "Decorar con crema"], whatYouWillLearn: "Técnicas de decoración",
        requiredMaterials: ["Delantal", "Espátula"], materialsNote: "Ingredientes incluidos", prerequisites: "Conocimientos básicos",
        location: "Academia", address: "Dirección de prueba", instructor: "Instructora de prueba",
        capacity: "6", price: "30000", reservationAmount: "10000", priceNote: "Incluye materiales",
        scheduleType: "weekly", scheduleWeekday: "monday", scheduleSessions: "3", scheduleStartDate: "2026-11-09",
        scheduleStartTime: "09:00", scheduleEndTime: "12:00", scheduleNote: "Llegar quince minutos antes"
    };
    let payload;
    await mount(<CourseForm initialValues={values} requirePrice onSubmit={async (value) => { payload = value; }}
        onCancel={() => {}} />, "/admin/cursos/1/editar");
    for (let step = 0; step < 4; step++) await button("Siguiente");
    function review() { return container.querySelector('[aria-label="Revisión del curso"]'); }
    for (const value of [values.name, values.summary, values.description, values.imageUrl, ...values.learningOutcomes,
        values.whatYouWillLearn, ...values.requiredMaterials, values.materialsNote, values.prerequisites,
        values.location, values.address, values.instructor, values.priceNote, values.scheduleNote, "09:00", "12:00", "3 clases"]) {
        assert(review().textContent.includes(value), "Review includes: " + value);
    }
    const amount = [...review().querySelectorAll("dt")].find((element) => element.textContent === "Monto para reservar");
    assert(amount.nextElementSibling.textContent === formatPrice(10000), "Exact reservation amount displayed");
    assert(review().querySelectorAll("button").length === 4, "Each editable stage has a return option");
    for (const [index, title] of ["Información e imagen", "Contenido", "Lugar y planificación", "Horario"].entries()) {
        await settle(() => review().querySelector(`button[aria-label="Editar ${title.toLowerCase()}"]`).click());
        assert(container.querySelector('[aria-current="step"]').textContent.includes(title), "Edit opens correct stage");
        assert(document.activeElement.tagName === "H2", "Edit focuses stage heading");
        if (index === 2) {
            values.instructor = "Instructora actualizada";
            await input("instructor", values.instructor);
        }
        for (let step = index; step < 4; step++) await button("Siguiente");
        assert(payload === undefined, "Editing review stages does not persist");
    }
    assert(review().textContent.includes(values.instructor), "Review reflects edits");
    assert(document.documentElement.scrollWidth <= window.innerWidth, "Full review fits mobile width");
    await button("Guardar curso");
    assert(JSON.stringify(payload) === JSON.stringify(toCoursePayload(values)), "Review and stage edits preserve complete payload");

    await mount(<CourseForm initialValues={{ ...EMPTY_COURSE_FORM, name: "Curso opcional", summary: "Resumen del curso",
        description: "Descripción válida del curso opcional.", price: "0", reservationAmount: "0" }} onSubmit={async () => {}} onCancel={() => {}} />, "/admin/cursos/nuevo");
    for (let step = 0; step < 4; step++) await button("Siguiente");
    assert(review().textContent.includes("Sin definir") && !review().textContent.includes("undefined"), "Missing optional fields have readable fallback");
    for (const label of ["Precio", "Monto para reservar"]) {
        const term = [...review().querySelectorAll("dt")].find((element) => element.textContent === label);
        assert(term.nextElementSibling.textContent === formatPrice(0), "Zero is a saved amount, not an absent value");
    }
});

await test("season actions confirm withdrawals, update admin state and open seasonal editing", async () => {
    const previousUser = auth.currentUser;
    auth.currentUser = { getIdToken: async () => "ux-test-token" };
    adminSeasonName = "Navidad";
    failSeasonWithdrawal = true;
    seasonalWithdrawals = [];

    try {
        await mount(adminCourseRoutes, "/admin/cursos");
        const seasonalRow = [...container.querySelectorAll("tbody tr")]
            .find((row) => row.textContent.includes("Queque navideño"));
        const regularRow = [...container.querySelectorAll("tbody tr")]
            .find((row) => row.textContent.includes("Curso regular"));
        assert(seasonalRow?.textContent.includes("Temporada: Navidad"), "Season badge shown");
        assert(regularRow && !regularRow.textContent.includes("Retirar de temporada"), "Regular courses have no season actions");

        const editLink = [...seasonalRow.querySelectorAll("a")]
            .find((linkElement) => linkElement.textContent.includes("Editar temporada"));
        assert(editLink?.getAttribute("href") === "/admin/cursos/admin-seasonal/editar#course-seasonName", "Edit link opens seasonal form section");

        const findRetireButton = (row) => [...row.querySelectorAll("button")]
            .find((buttonElement) => buttonElement.textContent.includes("Retirar de temporada"));
        await settle(() => findRetireButton(seasonalRow).click());
        const dialog = container.querySelector("dialog");
        assert(dialog?.open, "Withdrawal asks for confirmation");
        assert(dialog.textContent.includes("Queque navideño") && dialog.textContent.includes("Navidad"), "Confirmation identifies course and season");
        await settle(() => dialog.querySelector(".btn-danger").click());
        assert(text().includes("No se pudo") || text().includes("servidor"), "Withdrawal failure is announced");
        assert(container.querySelector('[title="Temporada: Navidad"]'), "Season label remains after failure");
        assert(window.location.pathname === "/admin/cursos", "Action does not trigger the row navigation");

        failSeasonWithdrawal = false;
        const retryRow = [...container.querySelectorAll("tbody tr")]
            .find((row) => row.textContent.includes("Queque navideño"));
        const retryButton = findRetireButton(retryRow);
        await settle(() => retryButton.click());
        await settle(() => container.querySelector("dialog").querySelector(".btn-danger").click());
        assert(adminSeasonName === null, "Dedicated delete action clears season designation");
        assert(!container.querySelector('[title="Temporada: Navidad"]'), "List badge disappears without reload");
        assert(text().includes("Se retiró"), "Success notice is shown");
        assert(seasonalWithdrawals.length === 2, "DELETE endpoint is called for each confirmed attempt");

        adminSeasonName = "Navidad";
        await mount(adminCourseRoutes, "/admin/cursos");
        const editSeasonLink = [...container.querySelectorAll("a")]
            .find((linkElement) => linkElement.textContent.includes("Editar temporada"));
        await settle(() => editSeasonLink.click());
        assert(
            container.querySelector("h2")?.textContent.includes("Paso 3 de 5: Lugar y planificación"),
            "Season editing opens the form section containing season fields"
        );
        assert(container.querySelector('[name="seasonName"]')?.value === "Navidad", "Season form is prefilled");

        adminSeasonName = "Navidad";
        await mount(adminCourseRoutes, "/admin/cursos/admin-seasonal");
        assert([...container.querySelectorAll("a")].some((linkElement) =>
            linkElement.textContent.includes("Editar temporada")
        ), "Detail shows season editing action");
        await button("Retirar de temporada");
        const detailDialog = container.querySelector("dialog");
        assert(detailDialog?.textContent.includes("Queque navideño") && detailDialog.textContent.includes("Navidad"), "Detail confirmation identifies course and season");
        await settle(() => detailDialog.querySelector(".btn-danger").click());
        assert(text().includes("Se retiró"), "Detail shows successful withdrawal");
        assert(![...container.querySelectorAll("a, button")].some((element) =>
            element.textContent.includes("Retirar de temporada") || element.textContent.includes("Editar temporada")
        ), "Season actions disappear after withdrawal");
    } finally {
        auth.currentUser = previousUser;
        adminSeasonName = "Navidad";
        failSeasonWithdrawal = false;
    }
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

await test("seasonal courses load independently, render reusable cards and do not duplicate", async () => {
    seasonalCourses = [seasonalCourse];
    includeSeasonalInCatalog = true;
    failSeasonalCourses = false;
    let releaseSeasonal;
    pendingSeasonalCourses = new Promise((resolve) => { releaseSeasonal = resolve; });

    try {
        await mount(courseRoutes, "/cursos?vista=todos");
        const loadingSection = container.querySelector('[aria-labelledby="seasonal-courses-title"]');
        assert(loadingSection?.getAttribute("aria-busy") === "true", "Seasonal cards show an independent skeleton");
        assert(text().includes("Mostrando 12 de 86 cursos"), "The main catalog loads while seasonal courses are pending");

        releaseSeasonal();
        pendingSeasonalCourses = null;
        await settle();

        const section = container.querySelector('[aria-labelledby="seasonal-courses-title"]');
        const featuredCard = section?.querySelector('[data-course-id="seasonal-course"]');
        assert(section && featuredCard, "Seasonal course is featured");
        assert(section.textContent.includes("Navidad"), "Season name is visible");
        assert(section.textContent.includes(formatPrice(seasonalCourse.price)), "Price uses the existing currency helper");
        assert(section.textContent.includes(formatScheduleSummary(seasonalCourse.schedule)), "Schedule uses the existing formatter");
        assert(section.querySelector("img")?.getAttribute("loading") === "lazy", "Card image is lazy loaded");
        assert(text().includes("Mostrando 12 de 85 cursos"), "Featured courses are excluded from the general catalog");
        assert(container.querySelectorAll('[data-course-id="seasonal-course"]').length === 1, "Course is not duplicated");
        assert(featuredCard.getAttribute("href") === "/cursos/seasonal-course", "Featured card links to course detail");

        await settle(() => featuredCard.click());
        assert(window.location.pathname === "/cursos/seasonal-course", "Clicking the card opens course detail");
    } finally {
        releaseSeasonal?.();
        pendingSeasonalCourses = null;
        seasonalCourses = [];
        includeSeasonalInCatalog = false;
        failSeasonalCourses = false;
    }

    await mount(courseRoutes, "/cursos");
    const emptyAside = container.querySelector('[aria-labelledby="seasonal-courses-title"]');
    assert(emptyAside, "Seasonal sidebar stays visible without seasonal courses");
    assert(emptyAside.textContent.includes("Por ahora no hay cursos de temporada"), "Empty seasonal sidebar explains there are no courses");
    assert(!emptyAside.querySelector("[data-course-id]"), "Empty seasonal sidebar lists no courses");
});

await test("seasonal request errors do not block the main catalog and can be retried", async () => {
    seasonalCourses = [seasonalCourse];
    includeSeasonalInCatalog = true;
    failSeasonalCourses = true;

    try {
        await mount(courseRoutes, "/cursos?vista=todos");
        assert(text().includes("No se pudieron cargar los cursos de temporada"), "Seasonal error is discreetly reported");
        assert(text().includes("Mostrando 12 de 86 cursos"), "Main catalog remains available after seasonal error");

        failSeasonalCourses = false;
        await button("Reintentar");
        assert(text().includes("Mostrando 12 de 85 cursos"), "Retry loads the featured courses and removes duplicates");
        assert(container.querySelectorAll('[data-course-id="seasonal-course"]').length === 1, "Retried course appears only once");
    } finally {
        seasonalCourses = [];
        includeSeasonalInCatalog = false;
        failSeasonalCourses = false;
    }
});

await test("responsive catalog cards keep the same width with one or many items", async () => {
    // Regression: auto-fit + 1fr used to stretch a single course across the entire page.
    await mount(courseRoutes, "/cursos?tipo=demonstrative");
    const singleCourse = container.querySelector('ul[aria-label="Cursos disponibles"] li');
    assert(singleCourse && container.querySelectorAll('ul[aria-label="Cursos disponibles"] li').length === 1, "Fixture must contain exactly one course");
    const singleCourseWidth = singleCourse.getBoundingClientRect().width;
    assert(singleCourseWidth > 0 && singleCourseWidth <= 372, "Single course respects a responsive maximum width");

    await mount(courseRoutes, "/cursos?tipo=workshop");
    const manyCourseWidth = container.querySelector('ul[aria-label="Cursos disponibles"] li').getBoundingClientRect().width;
    assert(Math.abs(singleCourseWidth - manyCourseWidth) <= 2, `Course width stable: one=${singleCourseWidth.toFixed(1)}px, many=${manyCourseWidth.toFixed(1)}px`);

    await mount(<ProductsList />, "/tienda");
    const category = container.querySelector('ul[aria-label="Categorías"] li');
    assert(category && category.getBoundingClientRect().width <= 302, "Category tiles have a maximum width");

    singleProductResult = true;
    try {
        await mount(<ProductsList />, "/tienda?vista=todos");
        const singleProduct = container.querySelector('ul[aria-label="Productos"] li');
        assert(singleProduct && container.querySelectorAll('ul[aria-label="Productos"] li').length === 1, "Fixture must contain one product");
        const singleProductWidth = singleProduct.getBoundingClientRect().width;
        assert(singleProductWidth > 0 && singleProductWidth <= 302, "Single product does not stretch");
        singleProductResult = false;
        await mount(<ProductsList />, "/tienda?vista=todos");
        const manyProductWidth = container.querySelector('ul[aria-label="Productos"] li').getBoundingClientRect().width;
        assert(Math.abs(singleProductWidth - manyProductWidth) <= 2, `Product width stable: one=${singleProductWidth.toFixed(1)}px, many=${manyProductWidth.toFixed(1)}px`);
        assert(document.documentElement.scrollWidth <= window.innerWidth, "Catalog has no horizontal overflow");
    } finally {
        singleProductResult = false;
    }
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

await test("course type icons, incremental totals, filter reset and deep block links", async () => {
    await mount(courseRoutes, "/cursos");
    const grid = container.querySelector('ul[aria-label="Tipos de curso"]');
    assert(grid.querySelector("a").textContent === "Ver todos", "Virtual all first for courses");
    assert(!grid.querySelector(".lucide-image-off"), "Course types use intentional icons");
    for (const icon of ["chef-hat", "graduation-cap", "eye", "hand", "calendar-days", "book-open", "layout-grid"]) {
        assert(grid.querySelector('.lucide-' + icon), "Expected course category icon: " + icon);
    }
    await link("Taller");
    assert(text().includes("Mostrando 12 de 13 cursos"), "Real filtered course total");
    const first = container.querySelector('[data-course-id="0"]');
    await button("Cargar más cursos");
    assert(text().includes("Mostrando 13 de 13 cursos"), "Final partial block total");
    assert(first === container.querySelector('[data-course-id="0"]'), "Appending preserves existing cards");
    assert(![...container.querySelectorAll("button")].some((item) => item.textContent.includes("Cargar más")), "Hide load more at end");
    assert(text().includes("Llegaste al final"), "Discrete end message");
    assert(!text().includes("Siguiente") && !text().includes("Anterior"), "Catalog no longer has page buttons");
    await select(container.querySelector('nav select'), "basic");
    assert(text().includes("Mostrando 12 de 66 cursos") && !window.location.search.includes("pagina"), "Changing type resets blocks and filtered total");
    await mount(courseRoutes, "/cursos?tipo=workshop&pagina=99");
    assert(text().includes("Mostrando 13 de 13 cursos"), "Oversized deep block count clamps safely");
    await mount(courseRoutes, "/cursos?tipo=desconocido");
    assert(text().includes("Mostrando 0 de 0 cursos") && !text().includes("Llegaste al final"), "Unknown type is empty");
    for (const value of ["-1", "abc", "1.5", "Infinity"]) {
        await mount(courseRoutes, "/cursos?vista=todos&pagina=" + value);
        assert(text().includes("Mostrando 12 de 85 cursos"), "Invalid block count falls back to first block: " + value);
    }
});

await test("course append preserves actual scroll and focus, type/category navigation resets context", async () => {
    requests = [];
    await mount(courseRoutes, "/cursos?vista=todos");
    const listRequests = () => requests.filter((url) => url.pathname.endsWith("/courses")).length;
    assert(listRequests() === 1, "Courses fetched once");
    await settle(() => window.scrollTo(0, document.documentElement.scrollHeight));
    const before = window.scrollY;
    assert(before > 0, "Test starts scrolled below first viewport");
    await button("Cargar más cursos");
    assert(Math.abs(window.scrollY - before) <= 1, "Appending does not move viewport");
    assert(document.activeElement.dataset.courseId === "12", "Focus first new card without scrolling");
    assert(text().includes("Mostrando 24 de 85 cursos"), "Second block total");
    assert(new URLSearchParams(window.location.search).get("pagina") === "2", "URL saves number of loaded blocks");
    for (const count of [36, 48, 60, 72, 84, 85]) {
        await button("Cargar más cursos");
        assert(text().includes('Mostrando ' + count + ' de 85 cursos'), "Incremental count: " + count);
    }
    assert(listRequests() === 1, "Presentation-only append makes no extra API calls");
    await settle(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await select(container.querySelector('nav select'), "basic");
    const heading = container.querySelector("h1");
    assert(document.activeElement === heading && Math.abs(heading.getBoundingClientRect().top) <= 1, "Type change focuses heading at top");
    assert(text().includes("Mostrando 12 de 66 cursos"), "Type change resets expanded count");
    await settle(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await button("Volver a categorías");
    assert(document.activeElement === heading && heading.getBoundingClientRect().top >= -1
        && heading.getBoundingClientRect().bottom <= window.innerHeight, "Returning to categories focuses a visible heading");
    assert(!window.location.search, "Returning to categories clears filters and blocks");
    await link("Ver todos");
    assert(text().includes("Mostrando 12 de 85 cursos"), "Reopening catalog starts at 12");
});

await test("course detail return link and browser back restore expanded cards and context", async () => {
    await mount(courseRoutes, "/cursos?vista=todos");
    await button("Cargar más cursos");
    await button("Cargar más cursos");
    async function openCourse() {
        const card = container.querySelector('[data-course-id="29"]');
        await settle(() => { card.scrollIntoView({ block: "center" }); card.click(); });
        assert(window.location.pathname === "/cursos/29", "Real detail route opens");
        assert(text().includes("Curso 29"), "Actual detail rendered");
    }
    function restored(count = "Mostrando 36 de 85 cursos") {
        assert(text().includes(count), "Return restores all loaded blocks");
        assert(document.activeElement.dataset.courseId === "29", "Opened card regains focus");
        const bounds = document.activeElement.getBoundingClientRect();
        assert(bounds.top >= -1 && bounds.bottom <= window.innerHeight + 1, "Restored card is visible in viewport");
    }
    await openCourse();
    await link("Volver a los cursos");
    restored();
    await openCourse();
    await settle(() => window.history.back());
    restored();
    await select(container.querySelector('nav select'), "basic");
    await button("Cargar más cursos");
    await openCourse();
    await link("Volver a los cursos");
    restored("Mostrando 24 de 66 cursos");
    assert(new URLSearchParams(window.location.search).get("tipo") === "basic", "Detail return preserves type filter");
});

await test("course loading and retry preserve deep block selection", async () => {
    let release;
    pendingCourses = new Promise((resolve) => { release = resolve; });
    await mount(courseRoutes, "/cursos?tipo=workshop&pagina=2");
    assert(text().includes("Cargando cursos") && !text().includes("Mostrando"), "Independent initial loading state");
    failCourses = true;
    release(); pendingCourses = null;
    await settle();
    assert(text().includes("No se pudieron cargar los cursos"), "Readable load error");
    failCourses = false;
    await button("Reintentar");
    assert(text().includes("Mostrando 13 de 13 cursos"), "Retry retains type and block URL");
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
