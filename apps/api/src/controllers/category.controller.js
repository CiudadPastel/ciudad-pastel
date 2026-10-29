import { getPublicCategories } from "../services/product.service.js";

export async function listPublicCategories(req, res) {
    try {
        return res.status(200).json(await getPublicCategories());
    } catch (error) {
        console.error("Category catalog error:", error);
        return res.status(500).json({ message: "Could not load the product categories." });
    }
}
