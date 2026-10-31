import { pathToFileURL } from "node:url";

import { buildCategory } from "../src/models/category.model.js";
import { buildProduct, PRODUCT_STATUS } from "../src/models/product.model.js";
import {
    validateCategoryInput,
    validateProductInput
} from "../src/validators/product.validator.js";

// Builds and returns the deterministic sample seed data for development.
export function buildSeedData() {
    const rawCategories = [
        { id: "seed-cat-1", name: "Harinas y mezclas", order: 1 },
        { id: "seed-cat-2", name: "Chocolates y coberturas", order: 2 },
        { id: "seed-cat-3", name: "Colorantes y esencias", order: 3 },
        { id: "seed-cat-4", name: "Moldes y utensilios", order: 4 },
        { id: "seed-cat-5", name: "Decoración y toppings", order: 5 },
        { id: "seed-cat-6", name: "Empaques y bases", order: 6 }
    ];

    const makeImageUrl = (name) => `https://placehold.co/600x400/png?text=${encodeURIComponent(name)}`;

    const rawProducts = [
        {
            id: "seed-prod-01",
            name: "Harina de trigo todo uso 1 kg",
            description: "Harina de trigo todo uso de alta calidad para repostería y panadería.",
            brand: "Molinos del Valle",
            weight: "1 kg",
            size: null,
            price: 1450,
            categoryId: "seed-cat-1",
            imageUrl: makeImageUrl("Harina de trigo todo uso 1 kg"),
            available: true,
            status: PRODUCT_STATUS.PUBLISHED
        },
        {
            id: "seed-prod-02",
            name: "Harina de trigo repostería 2 kg",
            description: "Harina fina especial para pastelería y queques esponjosos.",
            brand: "Molinos del Valle",
            weight: "2 kg",
            size: null,
            price: 3200,
            categoryId: "seed-cat-1",
            imageUrl: makeImageUrl("Harina de trigo repostería 2 kg"),
            available: true,
            status: PRODUCT_STATUS.PUBLISHED
        },
        {
            id: "seed-prod-03",
            name: "Mezcla para bizcocho de vainilla 1 kg",
            description: "Premezcla lista para preparar bizcochos suaves con sabor a vainilla.",
            brand: "Dulce Hogar",
            weight: "1 kg",
            size: null,
            price: 3900,
            categoryId: "seed-cat-1",
            imageUrl: makeImageUrl("Mezcla para bizcocho de vainilla 1 kg"),
            available: true,
            status: PRODUCT_STATUS.PUBLISHED
        },
        {
            id: "seed-prod-04",
            name: "Azúcar glass 500 g",
            description: "Azúcar pulverizada ideal para nevados, glaseados y fondant.",
            brand: "Dulce Hogar",
            weight: "500 g",
            size: null,
            price: 1250,
            categoryId: "seed-cat-1",
            imageUrl: null,
            available: true,
            status: PRODUCT_STATUS.PUBLISHED
        },
        {
            id: "seed-prod-05",
            name: "Chocolate semiamargo en barra 500 g",
            description: "Chocolate puro 55% cacao para fundir, moldear y decorar.",
            brand: "Cacao Real",
            weight: "500 g",
            size: null,
            price: 6800,
            categoryId: "seed-cat-2",
            imageUrl: makeImageUrl("Chocolate semiamargo en barra 500 g"),
            available: true,
            status: PRODUCT_STATUS.PUBLISHED
        },
        {
            id: "seed-prod-06",
            name: "Cobertura de chocolate blanco 1 kg",
            description: "Cobertura fácil de temperar con cremoso sabor a leche y vainilla.",
            brand: "Cacao Real",
            weight: "1 kg",
            size: null,
            price: 11500,
            categoryId: "seed-cat-2",
            imageUrl: makeImageUrl("Cobertura de chocolate blanco 1 kg"),
            available: true,
            status: PRODUCT_STATUS.PUBLISHED
        },
        {
            id: "seed-prod-07",
            name: "Cacao en polvo sin azúcar 250 g",
            description: "Cacao amargo puro desgrasado ideal para brownies y queques.",
            brand: "Cacao Real",
            weight: "250 g",
            size: null,
            price: 4300,
            categoryId: "seed-cat-2",
            imageUrl: makeImageUrl("Cacao en polvo sin azúcar 250 g"),
            available: false,
            status: PRODUCT_STATUS.PUBLISHED
        },
        {
            id: "seed-prod-08",
            name: "Colorante en gel rojo 20 g",
            description: "Colorante concentrado comestible que no altera la consistencia de las masas.",
            brand: "Arcoíris",
            weight: "20 g",
            size: null,
            price: 2100,
            categoryId: "seed-cat-3",
            imageUrl: makeImageUrl("Colorante en gel rojo 20 g"),
            available: true,
            status: PRODUCT_STATUS.PUBLISHED
        },
        {
            id: "seed-prod-09",
            name: "Colorante en gel azul 20 g",
            description: "Colorante comestible de tono intenso para glaseados y merengues.",
            brand: "Arcoíris",
            weight: "20 g",
            size: null,
            price: 2100,
            categoryId: "seed-cat-3",
            imageUrl: makeImageUrl("Colorante en gel azul 20 g"),
            available: true,
            status: PRODUCT_STATUS.PUBLISHED
        },
        {
            id: "seed-prod-10",
            name: "Esencia de vainilla 120 ml",
            description: "Extracto concentrado aromático tradicional para masas y rellenos.",
            brand: "Aromas del Trópico",
            weight: "120 ml",
            size: null,
            price: 3600,
            categoryId: "seed-cat-3",
            imageUrl: makeImageUrl("Esencia de vainilla 120 ml"),
            available: true,
            status: PRODUCT_STATUS.PUBLISHED
        },
        {
            id: "seed-prod-11",
            name: "Esencia de almendra 60 ml",
            description: "Saborizante artificial puro para postres, queques y galletas.",
            brand: "Aromas del Trópico",
            weight: "60 ml",
            size: null,
            price: 2900,
            categoryId: "seed-cat-3",
            imageUrl: makeImageUrl("Esencia de almendra 60 ml"),
            available: false,
            status: PRODUCT_STATUS.PUBLISHED
        },
        {
            id: "seed-prod-12",
            name: "Molde redondo desmontable 24 cm",
            description: "Molde antiadherente de acero al carbono con broche de seguridad.",
            brand: "PasteliPro",
            weight: null,
            size: "24 cm de diámetro × 7 cm de alto",
            price: 8900,
            categoryId: "seed-cat-4",
            imageUrl: makeImageUrl("Molde redondo desmontable 24 cm"),
            available: true,
            status: PRODUCT_STATUS.PUBLISHED
        },
        {
            id: "seed-prod-13",
            name: "Espátula de silicón",
            description: "Espátula flexible resistente a altas temperaturas para repostería.",
            brand: null,
            weight: null,
            size: "27 cm de largo",
            price: 2800,
            categoryId: "seed-cat-4",
            imageUrl: null,
            available: true,
            status: PRODUCT_STATUS.PUBLISHED
        },
        {
            id: "seed-prod-14",
            name: "Mangas pasteleras desechables x50",
            description: "Paquete de 50 mangas plásticas resistentes para boquillas estándar.",
            brand: "PasteliPro",
            weight: null,
            size: "30 cm (50 unidades)",
            price: 3400,
            categoryId: "seed-cat-4",
            imageUrl: makeImageUrl("Mangas pasteleras desechables x50"),
            available: true,
            status: PRODUCT_STATUS.PUBLISHED
        },
        {
            id: "seed-prod-15",
            name: "Chispas de colores 100 g",
            description: null,
            brand: null,
            weight: "100 g",
            size: null,
            price: 1800,
            categoryId: "seed-cat-5",
            imageUrl: null,
            available: true,
            status: PRODUCT_STATUS.PUBLISHED
        },
        {
            id: "seed-prod-16",
            name: "Perlas comestibles plateadas 50 g",
            description: "Perlas brillantes de azúcar para acabado fino en pasteles de fiesta.",
            brand: "Arcoíris",
            weight: "50 g",
            size: null,
            price: 2500,
            categoryId: "seed-cat-5",
            imageUrl: makeImageUrl("Perlas comestibles plateadas 50 g"),
            available: false,
            status: PRODUCT_STATUS.PUBLISHED
        },
        {
            id: "seed-prod-17",
            name: "Caja para pastel 25x25 cm",
            description: "Caja de cartón kraft con visor transparente para transporte seguro.",
            brand: "Empaques CP",
            weight: null,
            size: "25 × 25 × 12 cm",
            price: 1600,
            categoryId: "seed-cat-6",
            imageUrl: makeImageUrl("Caja para pastel 25x25 cm"),
            available: true,
            status: PRODUCT_STATUS.WITHDRAWN
        },
        {
            id: "seed-prod-18",
            name: "Base redonda dorada 30 cm",
            description: "Base rígida de soporte laminada resistente a la humedad y grasa.",
            brand: "Empaques CP",
            weight: null,
            size: "30 cm de diámetro",
            price: 1200,
            categoryId: "seed-cat-6",
            imageUrl: makeImageUrl("Base redonda dorada 30 cm"),
            available: true,
            status: PRODUCT_STATUS.WITHDRAWN
        }
    ];

    // Validate categories
    const categories = rawCategories.map((cat) => {
        const validation = validateCategoryInput(cat);
        if (!validation.valid) {
            throw new Error(`Invalid seed category '${cat.name}': ${validation.errors.join(", ")}`);
        }
        return buildCategory({ id: cat.id, ...validation.data });
    });

    // Validate products
    const products = rawProducts.map((prod) => {
        const validation = validateProductInput(prod);
        if (!validation.valid) {
            throw new Error(`Invalid seed product '${prod.name}': ${validation.errors.join(", ")}`);
        }
        return buildProduct({ id: prod.id, ...validation.data, status: prod.status });
    });

    return { categories, products };
}

// Executes the seeding or removal workflow based on command-line flags.
export async function runSeed(args = process.argv.slice(2)) {
    const isApply = args.includes("--apply");
    const isRemove = args.includes("--remove");

    const { categories, products } = buildSeedData();

    if (!isApply) {
        console.log("=== DRY-RUN MODE: No changes will be applied to Firestore ===");
        console.log("Pass --apply to execute write operations.");
        console.log(`\nFound ${categories.length} categories to seed:`);
        categories.forEach((cat) => console.log(`  [Category] ${cat.id}: ${cat.name} (order: ${cat.order})`));

        console.log(`\nFound ${products.length} products to seed:`);
        products.forEach((prod) => {
            const availText = prod.available ? "Disponible" : "AGOTADO";
            const statusText = prod.status === PRODUCT_STATUS.WITHDRAWN ? "RETIRADO" : "Publicado";
            console.log(`  [Product] ${prod.id} (${prod.categoryId}): ${prod.name} - ₡${prod.price} [${availText}] [${statusText}]`);
        });

        console.log("\nDry-run completed successfully.");
        return;
    }

    const { db } = await import("../src/config/firebase.js");
    const { FieldValue } = await import("firebase-admin/firestore");

    if (isRemove) {
        console.log("Removing seeded documents (ids starting with 'seed-')...");

        const deleteCollectionSeedDocs = async (collectionName) => {
            const snapshot = await db.collection(collectionName).get();
            const seedDocs = snapshot.docs.filter((doc) => doc.id.startsWith("seed-"));
            for (const doc of seedDocs) {
                await doc.ref.delete();
                console.log(`Deleted ${collectionName}/${doc.id}`);
            }
        };

        await deleteCollectionSeedDocs("products");
        await deleteCollectionSeedDocs("categories");
        console.log("Removal of seed documents completed.");
        return;
    }

    console.log("Applying sample seed data to Firestore...");

    for (const cat of categories) {
        const docRef = db.collection("categories").doc(cat.id);
        const existing = await docRef.get();
        const payload = {
            name: cat.name,
            order: cat.order,
            updatedAt: FieldValue.serverTimestamp()
        };
        if (!existing.exists) {
            payload.createdAt = FieldValue.serverTimestamp();
        }
        await docRef.set(payload, { merge: true });
        console.log(`Upserted category: ${cat.id} (${cat.name})`);
    }

    for (const prod of products) {
        const docRef = db.collection("products").doc(prod.id);
        const existing = await docRef.get();
        const payload = {
            name: prod.name,
            brand: prod.brand,
            description: prod.description,
            weight: prod.weight,
            size: prod.size,
            price: prod.price,
            categoryId: prod.categoryId,
            imageUrl: prod.imageUrl,
            available: prod.available,
            status: prod.status,
            updatedAt: FieldValue.serverTimestamp()
        };
        if (!existing.exists) {
            payload.createdAt = FieldValue.serverTimestamp();
        }
        await docRef.set(payload, { merge: true });
        console.log(`Upserted product: ${prod.id} (${prod.name})`);
    }

    console.log("Seeding completed successfully.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    runSeed().catch((error) => {
        console.error("Seed execution failed:", error.message);
        process.exit(1);
    });
}
