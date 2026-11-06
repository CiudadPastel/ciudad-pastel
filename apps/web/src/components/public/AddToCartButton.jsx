import { ShoppingCart } from "lucide-react";
import { useCart } from "../../cart/useCart";

export default function AddToCartButton({ product }) {
    const { add } = useCart();
    return (
        <button type="button" className="btn btn-secondary" onClick={() => add(product)}
            aria-label={`Agregar al carrito: ${product.name}`}>
            <ShoppingCart size={18} aria-hidden="true" /> Agregar al carrito
        </button>
    );
}
