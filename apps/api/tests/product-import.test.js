import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("dotenv", () => ({ default: { config: vi.fn() } }));
vi.mock("../src/config/firebase.js", () => {
    throw new Error("Real Firebase access is forbidden in tests.");
});

import { parseCsv, parsePrice, readSheet, rowToProduct, runImport, slugify } from "../scripts/import-products.js";

const HEADER = "importar;catalogo;pagina;nombre;categoria;precio;peso;tamano;marca;descripcion;disponible;imagen;notas";

function memoryRepos({ categories = [], products = [] } = {}) {
    const state = {
        categories: new Map(categories.map((c) => [c.id, c])),
        products: new Map(products.map((p) => [p.id, p]))
    };
    return {
        state,
        getCategories: vi.fn(async () => [...state.categories.values()]),
        upsertCategory: vi.fn(async (c) => { state.categories.set(c.id, c); return c; }),
        getProductById: vi.fn(async (id) => state.products.get(id) ?? null),
        upsertProduct: vi.fn(async (p) => { state.products.set(p.id, p); return p; })
    };
}

function writeCatalog(lines, photos = []) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "import-"));
    fs.mkdirSync(path.join(dir, "fotos"));
    for (const photo of photos) fs.writeFileSync(path.join(dir, "fotos", photo), Buffer.from([0xff, 0xd8, 0xff, 0xe0]));
    const file = path.join(dir, "productos.csv");
    fs.writeFileSync(file, "﻿" + [HEADER, ...lines].join("\r\n"), "utf8");
    return file;
}

describe("lectura de la hoja", () => {
    it("lee CSV de Excel en español (; y BOM) con comillas", () => {
        const rows = parseCsv(`﻿${HEADER}\r\nsí;Moldes;3;"Molde ""esferas""; 8 cm";Moldes de silicón;₡ 5.000;;8 cm;;;sí;moldes-p003.jpg;\r\n`);
        expect(rows).toHaveLength(1);
        expect(rows[0].values).toMatchObject({ importar: "sí", nombre: "Molde \"esferas\"; 8 cm", precio: "₡ 5.000", tamano: "8 cm" });
    });

    it("también acepta comas como separador", () => {
        const rows = parseCsv("importar,nombre,precio\nsi,Escarcha lila,1750\n");
        expect(rows[0].values).toEqual({ importar: "si", nombre: "Escarcha lila", precio: "1750" });
    });

    it("lee bien las tildes aunque Excel guarde el archivo en Windows-1252", () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), "import-"));
        const file = path.join(dir, "ansi.csv");
        fs.writeFileSync(file, Buffer.from("nombre;categoria\r\nEspátula;Moldes de silicón\r\n", "latin1"));
        expect(parseCsv(readSheet(file))[0].values).toEqual({ nombre: "Espátula", categoria: "Moldes de silicón" });
    });

    it("entiende precios escritos de varias formas", () => {
        expect(parsePrice("₡ 3.500")).toBe(3500);
        expect(parsePrice("3,500")).toBe(3500);
        expect(parsePrice("1750")).toBe(1750);
        expect(parsePrice("")).toBeNull();
    });

    it("arma un id fijo con el catálogo y la página", () => {
        const row = rowToProduct({ line: 2, values: { importar: "sí", catalogo: "Escarchas y más", pagina: "20", nombre: "Escarcha cobre", categoria: "Escarchas", precio: "1750" } });
        expect(row.id).toBe("cat-escarchas-y-mas-p20");
        expect(slugify("Moldes de silicón")).toBe("moldes-de-silicon");
    });

    it("valida con las mismas reglas del panel de administración", () => {
        const row = rowToProduct({ line: 5, values: { importar: "sí", nombre: "X", categoria: "", precio: "" } });
        expect(row.errors).toEqual(expect.arrayContaining([
            "name must contain at least 3 characters.",
            expect.stringMatching(/^price must be an integer/),
            "falta la categoría"
        ]));
    });
});

describe("importación", () => {
    let log;
    beforeEach(() => {
        log = vi.spyOn(console, "log").mockImplementation(() => {});
        return () => log.mockRestore();
    });

    const lines = [
        "sí;Escarchas y más;20;Escarcha cobre;Escarchas;₡ 1750;5 g;;;;sí;escarchas-p020.jpg;",
        "sí;Moldes de silicón;3;Molde de esferas 8 cm;Moldes de Silicón;5000;;8 cm;;Ideal para chocolate.;sí;moldes-p003.jpg;",
        "revisar;Moldes de silicón;84;Molde marino (diseño 1);Moldes de silicón;3000;;;;;sí;moldes-p084.jpg;Nombre repetido",
        "no;Escarchas y más;21;Escarcha café;Escarchas;1750;5 g;;;;sí;escarchas-p021.jpg;"
    ];

    it("la prueba (sin --apply) no guarda nada ni sube fotos", async () => {
        const file = writeCatalog(lines, ["escarchas-p020.jpg", "moldes-p003.jpg"]);
        const repositories = memoryRepos();
        const uploadImage = vi.fn();

        const result = await runImport([file], { repositories, uploadImage });

        expect(result.plan.map((item) => item.row.id)).toEqual(["cat-escarchas-y-mas-p20", "cat-moldes-de-silicon-p3"]);
        expect(result.newCategories.map((c) => c.name)).toEqual(["Escarchas", "Moldes de Silicón"]);
        expect(repositories.upsertProduct).not.toHaveBeenCalled();
        expect(repositories.upsertCategory).not.toHaveBeenCalled();
        expect(uploadImage).not.toHaveBeenCalled();
    });

    it("con --apply crea categorías, sube fotos y publica solo las filas con sí", async () => {
        const file = writeCatalog(lines, ["escarchas-p020.jpg", "moldes-p003.jpg"]);
        const repositories = memoryRepos({ categories: [{ id: "c1", name: "Moldes de silicon", order: 3 }] });
        const uploadImage = vi.fn(async (_file, publicId) => `https://res.cloudinary.com/demo/image/upload/${publicId}.jpg`);

        const result = await runImport([file, "--apply"], { repositories, uploadImage });

        expect(result.saved).toBe(2);
        // "Moldes de Silicón" se reconoce como la categoría existente "Moldes de silicon"
        expect([...repositories.state.categories.values()].map((c) => c.name)).toEqual(["Moldes de silicon", "Escarchas"]);
        expect(repositories.state.categories.get("cat-escarchas").order).toBe(4);
        const molde = repositories.state.products.get("cat-moldes-de-silicon-p3");
        expect(molde).toMatchObject({
            name: "Molde de esferas 8 cm",
            price: 5000,
            size: "8 cm",
            categoryId: "c1",
            status: "published",
            available: true,
            description: "Ideal para chocolate.",
            imageUrl: "https://res.cloudinary.com/demo/image/upload/ciudad-pastel/productos/cat-moldes-de-silicon-p3.jpg"
        });
        expect(repositories.state.products.get("cat-escarchas-y-mas-p20")).toMatchObject({ weight: "5 g", price: 1750 });
        expect(repositories.state.products.has("cat-moldes-de-silicon-p84")).toBe(false);
        expect(repositories.state.products.has("cat-escarchas-y-mas-p21")).toBe(false);
    });

    it("correrlo dos veces no duplica ni pisa cambios, salvo con --actualizar", async () => {
        const file = writeCatalog(lines, ["escarchas-p020.jpg", "moldes-p003.jpg"]);
        const repositories = memoryRepos();
        const uploadImage = vi.fn(async () => "https://res.cloudinary.com/demo/x.jpg");

        await runImport([file, "--apply"], { repositories, uploadImage });
        repositories.state.products.get("cat-escarchas-y-mas-p20").price = 1900; // cambio hecho en el panel
        const second = await runImport([file, "--apply"], { repositories, uploadImage });

        expect(second.saved).toBe(0);
        expect(repositories.state.products.size).toBe(2);
        expect(repositories.state.products.get("cat-escarchas-y-mas-p20").price).toBe(1900);

        const third = await runImport([file, "--apply", "--actualizar"], { repositories, uploadImage });
        expect(third.saved).toBe(2);
        expect(repositories.state.products.get("cat-escarchas-y-mas-p20").price).toBe(1750);
    });

    it("reporta fotos que faltan y no importa esa fila", async () => {
        const file = writeCatalog(lines, ["moldes-p003.jpg"]);
        const repositories = memoryRepos();

        const result = await runImport([file, "--apply"], { repositories, uploadImage: vi.fn(async () => "https://x.test/a.jpg") });

        expect(result.problems).toEqual([expect.stringContaining("no se encontró la foto")]);
        expect(repositories.state.products.size).toBe(1);
    });

    it("--sin-fotos importa sin subir imágenes", async () => {
        const file = writeCatalog(lines);
        const repositories = memoryRepos();
        const uploadImage = vi.fn();

        const result = await runImport([file, "--apply", "--sin-fotos"], { repositories, uploadImage });

        expect(result.saved).toBe(2);
        expect(uploadImage).not.toHaveBeenCalled();
        expect(repositories.state.products.get("cat-escarchas-y-mas-p20").imageUrl).toBeNull();
    });

    it("si una foto falla al subir, sigue con los demás y lo reporta", async () => {
        const file = writeCatalog(lines, ["escarchas-p020.jpg", "moldes-p003.jpg"]);
        const repositories = memoryRepos();
        const uploadImage = vi.fn()
            .mockRejectedValueOnce(new Error("Cloudinary rechazó la foto (HTTP 401)."))
            .mockResolvedValueOnce("https://res.cloudinary.com/demo/y.jpg");

        const result = await runImport([file, "--apply"], { repositories, uploadImage });

        expect(result.saved).toBe(1);
        expect(result.ok).toBe(false);
        expect(log.mock.calls.flat().join("\n")).toContain("HTTP 401");
    });
});
