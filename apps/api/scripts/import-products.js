// Importa productos a la tienda desde una hoja de cálculo (CSV), con sus fotos.
//
// Uso (desde la raíz del proyecto):
//   node apps/api/scripts/import-products.js ruta/productos.csv                -> prueba, no guarda nada
//   node apps/api/scripts/import-products.js ruta/productos.csv --apply        -> guarda en Firestore
// Opciones:
//   --fotos <carpeta>  carpeta de las fotos (por defecto: "fotos" junto al CSV)
//   --sin-fotos        importa sin subir fotos (los productos quedan con la imagen por defecto)
//   --actualizar       también reemplaza productos que ya se importaron antes
//
// Solo se importan las filas con "sí" en la columna "importar". Las fotos se suben
// a Cloudinary (mismas variables CLOUDINARY_* que usa la página de inicio).
// Cada fila tiene un id fijo (catálogo + página), así que correrlo dos veces no
// duplica productos: los que ya existen se saltan, salvo con --actualizar.

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { buildCategory } from "../src/models/category.model.js";
import { buildProduct, PRODUCT_STATUS } from "../src/models/product.model.js";
import { validateCategoryInput, validateProductInput } from "../src/validators/product.validator.js";
import { normalizeSearchText } from "../src/utils/search-text.js";

const YES = new Set(["si", "s", "x", "yes", "true", "1"]);
const IMAGE_TYPES = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" };
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

// "Moldes de silicón" -> "moldes-de-silicon"
export function slugify(value) {
    return normalizeSearchText(value).replace(/\s+/g, "-").slice(0, 80);
}

function isYes(value) {
    return YES.has(normalizeSearchText(value ?? ""));
}

// CSV simple con comillas; detecta ";" (Excel en español) o ",".
export function parseCsv(text) {
    const content = text.replace(/^﻿/, "");
    const firstLine = content.split(/\r?\n/, 1)[0] ?? "";
    const delimiter = (firstLine.match(/;/g)?.length ?? 0) >= (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";
    const rows = [];
    let row = [];
    let field = "";
    let quoted = false;

    for (let i = 0; i < content.length; i += 1) {
        const char = content[i];
        if (quoted) {
            if (char === "\"" && content[i + 1] === "\"") {
                field += "\"";
                i += 1;
            } else if (char === "\"") {
                quoted = false;
            } else {
                field += char;
            }
        } else if (char === "\"") {
            quoted = true;
        } else if (char === delimiter) {
            row.push(field);
            field = "";
        } else if (char === "\n" || char === "\r") {
            if (char === "\r" && content[i + 1] === "\n") i += 1;
            row.push(field);
            rows.push(row);
            row = [];
            field = "";
        } else {
            field += char;
        }
    }
    if (field || row.length) {
        row.push(field);
        rows.push(row);
    }

    const [header = [], ...data] = rows.filter((cells) => cells.some((cell) => cell.trim()));
    const keys = header.map((name) => normalizeSearchText(name).replace(/\s+/g, ""));
    return data.map((cells, index) => ({
        line: index + 2,
        values: Object.fromEntries(keys.map((key, column) => [key, (cells[column] ?? "").trim()]))
    }));
}

// "₡ 3.500" / "3500" / "3,500" -> 3500
export function parsePrice(value) {
    const digits = String(value ?? "").replace(/[^\d]/g, "");
    return digits ? Number.parseInt(digits, 10) : null;
}

// Convierte una fila de la hoja en producto validado (sin categoría ni foto resueltas).
export function rowToProduct({ line, values }) {
    const id = values.id
        || [values.catalogo, values.pagina && `p${values.pagina}`].filter(Boolean).map(slugify).join("-")
        || slugify(values.nombre);
    const input = {
        name: values.nombre,
        brand: values.marca || null,
        description: values.descripcion || null,
        weight: values.peso || null,
        size: values.tamano || null,
        price: parsePrice(values.precio),
        categoryId: values.categoria ? "pendiente" : "",
        imageUrl: /^https?:\/\//i.test(values.imagen ?? "") ? values.imagen : null,
        available: values.disponible ? isYes(values.disponible) : true
    };
    const validation = validateProductInput(input);
    const errors = [...validation.errors];
    if (!values.categoria) errors.push("falta la categoría");
    if (!/^[a-z0-9-]{1,128}$/.test(`cat-${id}`)) errors.push("no se pudo armar un id válido");

    return {
        line,
        id: `cat-${id}`,
        include: isYes(values.importar),
        categoryName: values.categoria,
        imageFile: input.imageUrl ? null : values.imagen || null,
        data: validation.data,
        errors
    };
}

async function uploadToCloudinary(filePath, publicId) {
    const cloudName = process.env.CLOUDINARY_CLOUD_NAME?.trim();
    const key = process.env.CLOUDINARY_API_KEY?.trim();
    const secret = process.env.CLOUDINARY_API_SECRET?.trim();
    if (!cloudName || !key || !secret) {
        throw new Error("Cloudinary no está configurado (CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET en apps/api/.env). Use --sin-fotos para importar sin fotos.");
    }

    const type = IMAGE_TYPES[path.extname(filePath).toLowerCase()];
    const buffer = fs.readFileSync(filePath);
    const form = new FormData();
    form.append("file", new Blob([buffer], { type }), path.basename(filePath));
    form.append("public_id", publicId);
    form.append("overwrite", "true");

    const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
        method: "POST",
        headers: { Authorization: `Basic ${Buffer.from(`${key}:${secret}`).toString("base64")}` },
        body: form,
        signal: AbortSignal.timeout(30000)
    });
    if (!response.ok) throw new Error(`Cloudinary rechazó la foto (HTTP ${response.status}).`);
    const result = await response.json();
    if (typeof result.secure_url !== "string" || !result.secure_url.startsWith("https://")) {
        throw new Error("Cloudinary no devolvió una dirección válida para la foto.");
    }
    return result.secure_url;
}

// Excel a veces guarda el CSV en Windows-1252 en vez de UTF-8: las tildes se leen igual.
export function readSheet(filePath) {
    const buffer = fs.readFileSync(filePath);
    const text = buffer.toString("utf8");
    return text.includes("\uFFFD") ? new TextDecoder("windows-1252").decode(buffer) : text;
}

function argValue(args, name) {
    const index = args.indexOf(name);
    return index >= 0 ? args[index + 1] : undefined;
}

export async function runImport(args = process.argv.slice(2), deps = {}) {
    const csvPath = args.find((arg) => !arg.startsWith("--") && arg !== argValue(args, "--fotos"));
    if (!csvPath) {
        console.log("Uso: node apps/api/scripts/import-products.js productos.csv [--apply] [--fotos carpeta] [--sin-fotos] [--actualizar]");
        return { ok: false };
    }
    const apply = args.includes("--apply");
    const withPhotos = !args.includes("--sin-fotos");
    const update = args.includes("--actualizar");
    const photosDir = path.resolve(argValue(args, "--fotos") ?? path.join(path.dirname(csvPath), "fotos"));

    const rows = parseCsv(readSheet(csvPath)).map(rowToProduct);
    const selected = rows.filter((row) => row.include);
    console.log(apply ? "=== IMPORTANDO A FIRESTORE ===" : "=== PRUEBA: no se guarda nada (agregue --apply para guardar) ===");
    console.log(`Filas en la hoja: ${rows.length} · marcadas para importar: ${selected.length}\n`);

    const repos = deps.repositories ?? {
        ...(await import("../src/repositories/category.repository.js")),
        ...(await import("../src/repositories/product.repository.js"))
    };
    const upload = deps.uploadImage ?? uploadToCloudinary;

    // Categorías: se reutilizan por nombre (sin importar mayúsculas ni tildes); las nuevas se crean
    const categories = await repos.getCategories();
    const byName = new Map(categories.map((category) => [normalizeSearchText(category.name), category]));
    let nextOrder = Math.max(0, ...categories.map((category) => category.order ?? 0)) + 1;
    const newCategories = [];

    const problems = [];
    const plan = [];
    const seenIds = new Set();

    for (const row of selected) {
        const errors = [...row.errors];
        if (seenIds.has(row.id)) errors.push(`id repetido (${row.id})`);
        seenIds.add(row.id);

        let photoPath = null;
        if (withPhotos && row.imageFile) {
            photoPath = path.join(photosDir, path.basename(row.imageFile));
            if (!IMAGE_TYPES[path.extname(photoPath).toLowerCase()]) errors.push(`la foto debe ser .jpg, .png o .webp (${row.imageFile})`);
            else if (!fs.existsSync(photoPath)) errors.push(`no se encontró la foto ${photoPath}`);
            else if (fs.statSync(photoPath).size > MAX_IMAGE_BYTES) errors.push(`la foto pesa más de 5 MB (${row.imageFile})`);
        }

        if (errors.length) {
            problems.push(`  Línea ${row.line} (${row.data?.name ?? "sin nombre"}): ${errors.join("; ")}`);
            continue;
        }

        const key = normalizeSearchText(row.categoryName);
        let category = byName.get(key);
        if (!category) {
            const validation = validateCategoryInput({ name: row.categoryName, order: nextOrder });
            if (!validation.valid) {
                problems.push(`  Línea ${row.line}: categoría inválida (${validation.errors.join("; ")})`);
                continue;
            }
            category = buildCategory({ id: `cat-${slugify(row.categoryName)}`, ...validation.data });
            nextOrder += 1;
            byName.set(key, category);
            newCategories.push(category);
        }

        const existing = await repos.getProductById(row.id);
        if (existing && !update) {
            plan.push({ row, category, photoPath, action: "skip" });
        } else {
            plan.push({ row, category, photoPath, action: existing ? "update" : "create" });
        }
    }

    for (const category of newCategories) console.log(`  + Categoría nueva: ${category.name}`);
    for (const { row, category, action, photoPath } of plan) {
        const label = { create: "+ Nuevo     ", update: "~ Actualizar", skip: "= Ya existe " }[action];
        console.log(`  ${label} ${row.data.name} · ₡${row.data.price} · ${category.name}${photoPath ? " · con foto" : ""}`);
    }
    if (problems.length) {
        console.log(`\nFilas con problemas (no se importan):\n${problems.join("\n")}`);
    }

    const toSave = plan.filter((item) => item.action !== "skip");
    console.log(`\nResumen: ${toSave.filter((i) => i.action === "create").length} nuevos, ${toSave.filter((i) => i.action === "update").length} a actualizar, ${plan.length - toSave.length} ya existían, ${problems.length} con problemas, ${newCategories.length} categorías nuevas.`);

    if (!apply) {
        console.log("\nPrueba terminada. Si todo se ve bien, vuelva a correrlo con --apply.");
        return { ok: true, plan, problems, newCategories };
    }

    for (const category of newCategories) await repos.upsertCategory(category);

    let saved = 0;
    for (const { row, category, photoPath } of toSave) {
        try {
            const imageUrl = photoPath
                ? await upload(photoPath, `ciudad-pastel/productos/${row.id}`)
                : row.data.imageUrl ?? null;
            await repos.upsertProduct(buildProduct({
                id: row.id,
                ...row.data,
                categoryId: category.id,
                imageUrl,
                available: row.data.available !== false,
                status: PRODUCT_STATUS.PUBLISHED
            }));
            saved += 1;
            console.log(`  ✓ ${row.data.name}`);
        } catch (error) {
            console.log(`  ✗ ${row.data.name}: ${error.message}`);
        }
    }

    console.log(`\nListo: ${saved} de ${toSave.length} productos guardados. Los cambios se ven en la tienda en menos de un minuto.`);
    return { ok: saved === toSave.length, plan, problems, newCategories, saved };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    runImport().catch((error) => {
        console.error(`\nNo se pudo importar: ${error.message}`);
        process.exitCode = 1;
    });
}
