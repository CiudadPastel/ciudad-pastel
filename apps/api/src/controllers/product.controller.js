import { getPublicCatalog } from "../services/product.service.js";

// Handles the public product catalog listing request with optional page and limit pagination.
export async function getPublicProducts(req, res) {
    try {
        const page = req.query.page !== undefined ? parseInt(req.query.page, 10) : undefined;
        const limit = req.query.limit !== undefined ? parseInt(req.query.limit, 10) : undefined;

        const catalog = await getPublicCatalog({ page, limit });
        return res.status(200).json(catalog);
    } catch (error) {
        console.error("Product catalog error:", error);
        return res.status(500).json({
            message: "Could not load the product catalog."
        });
    }
}
