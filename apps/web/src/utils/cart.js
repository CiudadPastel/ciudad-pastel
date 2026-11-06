export const CART_STORAGE_KEY = "ciudad-pastel.cart.v1";
export const MAX_CART_PRODUCTS = 20;
export const MAX_CART_QUANTITY = 99;

export function productSnapshot(product) {
    if (!product || typeof product.id !== "string" || !product.id.trim() || product.id.length > 200
        || typeof product.name !== "string" || !product.name.trim() || product.name.length > 120
        || !Number.isInteger(product.price) || product.price < 0 || product.price > 10_000_000
        || typeof product.available !== "boolean") return null;
    let imageUrl = null;
    try {
        const url = new URL(product.imageUrl);
        if (["http:", "https:"].includes(url.protocol) && product.imageUrl.length <= 500) imageUrl = product.imageUrl;
    } catch { /* Missing or unsafe image: keep the product, use a placeholder. */ }
    return { id: product.id, name: product.name.trim(), price: product.price, imageUrl, available: product.available };
}

export function validQuantity(value) {
    return Number.isInteger(value) && value >= 1 && value <= MAX_CART_QUANTITY;
}

export function decodeCart(raw) {
    if (raw == null) return { items: [], invalid: false };
    if (typeof raw !== "string" || raw.length > 50_000) return { items: [], invalid: true };
    try {
        const data = JSON.parse(raw);
        if (!Array.isArray(data)) return { items: [], invalid: true };
        const items = new Map();
        let invalid = false;
        for (const entry of data) {
            const product = productSnapshot(entry);
            if (!product || !validQuantity(entry.quantity)) { invalid = true; continue; }
            const previous = items.get(product.id);
            if (previous) {
                invalid = true;
                previous.quantity = Math.min(MAX_CART_QUANTITY, previous.quantity + entry.quantity);
            } else if (items.size < MAX_CART_PRODUCTS) {
                items.set(product.id, { ...product, quantity: entry.quantity });
            } else invalid = true;
        }
        return { items: [...items.values()], invalid };
    } catch { return { items: [], invalid: true }; }
}

export function applyCartAction(items, action) {
    if (action.type === "add") {
        const product = productSnapshot(action.product);
        if (!product) return { items, message: "No se pudo agregar este producto. Actualice el catálogo." };
        const previous = items.find((item) => item.id === product.id);
        if (previous?.quantity === MAX_CART_QUANTITY) return { items, message: `El máximo es ${MAX_CART_QUANTITY} unidades por producto.` };
        if (!previous && items.length === MAX_CART_PRODUCTS) return { items, message: `Puede seleccionar hasta ${MAX_CART_PRODUCTS} productos distintos. Elimine uno para agregar otro.` };
        const quantity = (previous?.quantity || 0) + 1;
        return {
            items: previous ? items.map((item) => item.id === product.id ? { ...product, quantity } : item) : [...items, { ...product, quantity }],
            message: `${product.name}: ${quantity} ${quantity === 1 ? "unidad" : "unidades"} en el carrito.`
        };
    }
    if (action.type === "quantity") {
        if (!validQuantity(action.quantity)) return { items, message: `Use una cantidad entera de 1 a ${MAX_CART_QUANTITY}. Para eliminar, use Eliminar.` };
        return { items: items.map((item) => item.id === action.id ? { ...item, quantity: action.quantity } : item), message: "Cantidad actualizada." };
    }
    if (action.type === "remove") return { items: items.filter((item) => item.id !== action.id), message: "Producto eliminado del carrito." };
    if (action.type === "clear") return { items: [], message: "Carrito vaciado." };
    if (action.type === "refresh") {
        return { items: items.map((item) => {
            const result = action.results.find((entry) => entry.id === item.id && entry.status === "verified");
            return result ? { ...result.product, quantity: item.quantity } : item;
        }), message: "" };
    }
    return { items, message: "" };
}
