import { getPublicCatalog } from "../services/product.service.js";

// Handles the public product catalog listing request.
export async function getPublicProducts(req, res) {
    try {
        const catalog = await getPublicCatalog();
        return res.status(200).json(catalog);
    } catch (error) {
        console.error("Product catalog error:", error);
        return res.status(500).json({
            message: "Could not load the product catalog."
        });
    }
}
