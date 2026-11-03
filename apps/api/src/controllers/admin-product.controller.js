import {
    listAdminProducts as listAdminProductsService,
    getAdminProduct as getAdminProductService,
    createProduct as createProductService,
    updateProduct as updateProductService,
    removeProduct as removeProductService,
    listAdminCategories as listAdminCategoriesService
} from "../services/admin-product.service.js";

// Translates known service errors into HTTP responses.
function sendKnownError(res, error) {
    if (error.name === "ValidationError") {
        return res.status(400).json({ message: error.message, errors: error.details });
    }

    if (error.name === "NotFoundError") {
        return res.status(404).json({ message: error.message });
    }

    if (error.name === "ConflictError") {
        return res.status(409).json({ message: error.message, ...(error.code ? { code: error.code } : {}) });
    }

    return null;
}

// GET /api/admin/products
export async function getAdminProducts(req, res) {
    try {
        const products = await listAdminProductsService();
        return res.status(200).json(products);
    } catch (error) {
        if (sendKnownError(res, error)) return;

        console.error("Admin products list error:", error);
        return res.status(500).json({ message: "Could not retrieve products." });
    }
}

// GET /api/admin/products/:id
export async function getAdminProductById(req, res) {
    try {
        const product = await getAdminProductService(req.params.id);
        return res.status(200).json(product);
    } catch (error) {
        if (sendKnownError(res, error)) return;

        console.error("Admin product detail error:", error);
        return res.status(500).json({ message: "Could not retrieve product." });
    }
}

// POST /api/admin/products
export async function createAdminProduct(req, res) {
    try {
        const product = await createProductService(req.body);
        return res.status(201).json(product);
    } catch (error) {
        if (sendKnownError(res, error)) return;

        console.error("Admin product creation error:", error);
        return res.status(500).json({ message: "Could not create product." });
    }
}

// PUT /api/admin/products/:id
export async function updateAdminProduct(req, res) {
    try {
        const product = await updateProductService(req.params.id, req.body);
        return res.status(200).json(product);
    } catch (error) {
        if (sendKnownError(res, error)) return;

        console.error("Admin product update error:", error);
        return res.status(500).json({ message: "Could not update product." });
    }
}

// DELETE /api/admin/products/:id
export async function removeAdminProduct(req, res) {
    try {
        await removeProductService(req.params.id);
        return res.status(204).send();
    } catch (error) {
        if (sendKnownError(res, error)) return;

        console.error("Admin product removal error:", error);
        return res.status(500).json({ message: "Could not remove product." });
    }
}

// GET /api/admin/categories
export async function getAdminCategories(req, res) {
    try {
        const categories = await listAdminCategoriesService();
        return res.status(200).json(categories);
    } catch (error) {
        if (sendKnownError(res, error)) return;

        console.error("Admin categories list error:", error);
        return res.status(500).json({ message: "Could not retrieve categories." });
    }
}
