import { getPublicCatalog } from "../services/product.service.js";

// Handles public catalog query parameters without exposing malformed category queries as all products.
export async function getPublicProducts(req, res) {
    try {
        const categoryId = req.query.categoryId;
        const hasNestedCategoryKey = Object.keys(req.query).some((key) => key.startsWith("categoryId["));
        if (hasNestedCategoryKey ||
            (categoryId !== undefined && (typeof categoryId !== "string" || !categoryId.trim()))) {
            return res.status(400).json({ message: "categoryId must be a non-empty string." });
        }
        const page = req.query.page !== undefined ? parseInt(req.query.page, 10) : undefined;
        const limit = req.query.limit !== undefined ? parseInt(req.query.limit, 10) : undefined;

        const catalog = await getPublicCatalog({ page, limit, categoryId });
        return res.status(200).json(catalog);
    } catch (error) {
        console.error("Product catalog error:", error);
        return res.status(500).json({
            message: "Could not load the product catalog."
        });
    }
}
