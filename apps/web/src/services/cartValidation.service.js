import { getPublicProduct } from "./publicProducts.service";
import { productSnapshot } from "../utils/cart";

// At most four concurrent requests, only on cart entry/membership change and
// explicitly before preparing an inquiry. Quantity edits do not fetch products.
export async function validateCartProducts(ids) {
    const results = [];
    for (let offset = 0; offset < ids.length; offset += 4) {
        const batch = await Promise.all(ids.slice(offset, offset + 4).map(async (id) => {
            try {
                const product = productSnapshot(await getPublicProduct(id));
                if (!product || product.id !== id) throw new Error("Invalid public product.");
                return { id, status: "verified", product };
            } catch (error) {
                return { id, status: error.status === 404 ? "unavailable" : "error" };
            }
        }));
        results.push(...batch);
    }
    return results;
}
