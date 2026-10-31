import { getPublicCatalog, getPublicProductDetail } from "../services/product.service.js";

export const MAX_CATEGORY_FILTER_ENTRIES = 20;

// Handles public catalog query parameters without exposing malformed category queries as all products.
export async function getPublicProducts(req, res) {
    try {
        // Inspect original keys before Express can normalize brackets or truncate query parameters.
        const queryStart = req.originalUrl.indexOf("?");
        const query = new URLSearchParams(queryStart < 0 ? "" : req.originalUrl.slice(queryStart + 1));
        const keys = [...query.keys()];
        const single = query.getAll("categoryId");
        const multiple = query.getAll("categoryIds");
        if (keys.some((key) => key.startsWith("categoryId[")) ||
            single.length > 1 || (single.length === 1 && !single[0].trim())) {
            return res.status(400).json({ message: "categoryId must be a non-empty string." });
        }
        if (keys.some((key) => key.startsWith("categoryIds["))) {
            return res.status(400).json({ message: "categoryIds must use repeated non-empty string parameters; bracket notation is not supported." });
        }
        if (single.length && multiple.length) {
            return res.status(400).json({ message: "categoryId and categoryIds cannot be used together." });
        }
        if (multiple.length > MAX_CATEGORY_FILTER_ENTRIES) {
            return res.status(400).json({ message: `categoryIds must contain at most ${MAX_CATEGORY_FILTER_ENTRIES} entries.` });
        }
        if (multiple.some((id) => !id.trim())) {
            return res.status(400).json({ message: "categoryIds must contain only non-empty strings." });
        }
        const categoryId = single.length ? single[0] : undefined;
        const categoryIds = multiple.length ? [...new Set(multiple)] : undefined;
        const page = req.query.page !== undefined ? parseInt(req.query.page, 10) : undefined;
        const limit = req.query.limit !== undefined ? parseInt(req.query.limit, 10) : undefined;

        const catalog = await getPublicCatalog({ page, limit, categoryId, categoryIds });
        return res.status(200).json(catalog);
    } catch (error) {
        console.error("Product catalog error:", error);
        return res.status(500).json({
            message: "Could not load the product catalog."
        });
    }
}

// Public product detail (HU-T02): 404 for missing and hidden products alike.
export async function getPublicProductById(req, res) {
    try {
        const product = await getPublicProductDetail(req.params.id);

        if (!product) {
            return res.status(404).json({ message: "Product not found." });
        }

        return res.status(200).json(product);
    } catch (error) {
        console.error("Product detail error:", error);
        return res.status(500).json({ message: "Could not load the product." });
    }
}
