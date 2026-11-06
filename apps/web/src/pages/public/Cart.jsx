import { useEffect, useRef, useState } from "react";
import { ImageOff, Minus, Plus, Trash2 } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { useCart } from "../../cart/useCart";
import ConfirmDialog from "../../components/ui/ConfirmDialog";
import StateMessage from "../../components/ui/StateMessage";
import PreparedWhatsAppLink from "../../components/public/PreparedWhatsAppLink";
import { useWhatsAppContactState } from "../../hooks/useWhatsAppContact";
import { validateCartProducts } from "../../services/cartValidation.service";
import { applyCartAction, MAX_CART_PRODUCTS, MAX_CART_QUANTITY } from "../../utils/cart";
import { buildCartAvailabilityMessage } from "../../utils/whatsapp";
import { formatPrice } from "../../utils/format";
import styles from "./Cart.module.css";

function CartLine({ item, status, busy, onRemove, onQuantity }) {
    const [imageFailed, setImageFailed] = useState(false);
    return (
        <li className={styles.line}>
            {item.imageUrl && !imageFailed ? <img src={item.imageUrl} alt="" onError={() => setImageFailed(true)} />
                : <div className={styles.placeholder} aria-hidden="true"><ImageOff size={28} /></div>}
            <div className={styles.details}>
                <h2><Link to={`/tienda/${encodeURIComponent(item.id)}`} state={{ from: "/tienda/carrito" }}>{item.name}</Link></h2>
                <p>Precio publicado de referencia: {formatPrice(item.price)}</p>
                <p>{status === "verified" ? item.available
                    ? "Publicado como disponible; sujeto a confirmación."
                    : "Publicado como agotado. Puede consultar su futura disponibilidad."
                    : status === "unavailable" ? "Este producto ya no está disponible en el catálogo público. Elimínelo para continuar."
                        : status === "error" ? "No se pudo verificar este producto. Los datos guardados pueden haber cambiado."
                            : "Verificando información publicada…"}</p>
                <div className={styles.controls}>
                    <button type="button" className="btn btn-secondary" aria-label={`Disminuir cantidad de ${item.name}`}
                        disabled={busy || item.quantity <= 1} onClick={() => onQuantity(item.id, item.quantity - 1)}><Minus size={16} aria-hidden="true" /></button>
                    <label>Cantidad de {item.name}
                        <input type="number" inputMode="numeric" min={1} max={MAX_CART_QUANTITY} step={1}
                            value={item.quantity} disabled={busy} aria-describedby="cart-limits"
                            onChange={(event) => onQuantity(item.id, event.target.value.trim() ? Number(event.target.value) : NaN)} />
                    </label>
                    <button type="button" className="btn btn-secondary" aria-label={`Aumentar cantidad de ${item.name}`}
                        disabled={busy || item.quantity >= MAX_CART_QUANTITY} onClick={() => onQuantity(item.id, item.quantity + 1)}><Plus size={16} aria-hidden="true" /></button>
                    <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => onRemove(item.id)} aria-label={`Eliminar ${item.name}`}>
                        <Trash2 size={16} aria-hidden="true" /> Eliminar
                    </button>
                </div>
            </div>
        </li>
    );
}

export default function Cart() {
    const location = useLocation();
    const from = location.state?.catalogFrom;
    const returnState = { catalogScrollY: location.state?.catalogScrollY, focusProductId: location.state?.catalogFocusProductId };
    const catalogFrom = typeof from === "string" && (from === "/tienda" || from.startsWith("/tienda?")) ? from : "/tienda";
    const { items, units, setQuantity, remove, clear, refreshProducts } = useCart();
    const { contact, status: contactStatus, retry: retryContact } = useWhatsAppContactState();
    const [validation, setValidation] = useState({ key: null, results: [] });
    const [reload, setReload] = useState(0);
    const [checking, setChecking] = useState(false);
    const [confirmClear, setConfirmClear] = useState(false);
    const [prepared, setPrepared] = useState(null);
    const mounted = useRef(false);
    const readyHeading = useRef(null);
    const headingRef = useRef(null);
    const idsKey = JSON.stringify(items.map((item) => item.id));
    const validationKey = `${idsKey}|${reload}`;
    const cartKey = JSON.stringify(items);

    useEffect(() => {
        mounted.current = true;
        headingRef.current?.focus({ preventScroll: true });
        headingRef.current?.scrollIntoView({ block: "start", behavior: "instant" });
        return () => { mounted.current = false; };
    }, []);
    useEffect(() => {
        let active = true;
        validateCartProducts(JSON.parse(idsKey)).then((results) => {
            if (!active) return;
            refreshProducts(results);
            setValidation({ key: validationKey, results });
        });
        return () => { active = false; };
    }, [idsKey, validationKey, refreshProducts]);

    const loading = validation.key !== validationKey;
    const verified = !loading && items.every((item) => validation.results.some((result) => result.id === item.id && result.status === "verified"));
    const ready = verified && !checking && prepared?.key === cartKey && prepared?.phone === contact?.phone;
    const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);

    async function prepareInquiry() {
        if (checking || !contact || !verified || !items.length) return;
        setChecking(true);
        setPrepared(null);
        const results = await validateCartProducts(items.map((item) => item.id));
        if (!mounted.current) return;
        refreshProducts(results);
        setValidation({ key: validationKey, results });
        if (results.every((result) => result.status === "verified")) {
            const updated = applyCartAction(items, { type: "refresh", results }).items;
            setPrepared({ key: JSON.stringify(updated), phone: contact.phone, message: buildCartAvailabilityMessage(updated) });
            // Focus after React renders the prepared message/link.
            window.requestAnimationFrame(() => readyHeading.current?.focus());
        }
        setChecking(false);
    }

    function removeItem(id) {
        remove(id);
        window.requestAnimationFrame(() => headingRef.current?.focus());
    }

    if (!items.length) return <section className={styles.page}>
        <h1 ref={headingRef} tabIndex={-1}>Carrito de consultas</h1>
        <StateMessage title="Tu carrito está vacío" description="Agrega productos para consultar su disponibilidad."
            action={<Link to={catalogFrom} state={returnState} className="btn btn-primary">Explorar productos</Link>} />
    </section>;

    return (
        <section className={styles.page}>
            <h1 ref={headingRef} tabIndex={-1}>Carrito de consultas</h1>
            <p>Selecciona los productos que te interesan. Este carrito no reserva inventario ni confirma un pedido.</p>
            <Link to={catalogFrom} state={returnState} className="btn btn-secondary">Seguir explorando productos</Link>
            <p id="cart-limits" className={styles.note}>Hasta {MAX_CART_PRODUCTS} productos distintos y {MAX_CART_QUANTITY} unidades por producto.</p>
            {(loading || checking) && <p role="status">Verificando precios y disponibilidad publicados…</p>}
            {!loading && !verified && <div role="alert">
                <p>Hay productos que requieren revisión. Puede reintentar o eliminar los que ya no están publicados. Su selección se conserva.</p>
                <button className="btn btn-secondary" type="button" disabled={checking} onClick={() => setReload((value) => value + 1)}>Reintentar verificación</button>
            </div>}
            <ul className={styles.list}>
                {items.map((item) => <CartLine key={item.id} item={item} busy={checking}
                    status={loading ? "loading" : validation.results.find((result) => result.id === item.id)?.status}
                    onQuantity={setQuantity} onRemove={removeItem} />)}
            </ul>
            <section className={styles.summary} aria-label="Resumen de selección">
                <p>{units} unidades · {items.length} productos distintos</p>
                <p><strong>Subtotal de referencia: {formatPrice(subtotal)}</strong>{!verified && " (información por verificar)"}</p>
                <p className={styles.note}>Calculado con precios publicados. No es una cotización formal ni un precio confirmado.</p>
                <button type="button" className="btn btn-secondary" disabled={checking} onClick={() => setConfirmClear(true)}>Vaciar carrito</button>
            </section>
            {contactStatus === "loading" ? <p role="status">Cargando contacto de WhatsApp…</p>
                : !contact ? <div role="status"><p>WhatsApp no está disponible o no está configurado. No se puede preparar la consulta. Tu selección sigue guardada.</p>
                    <button className="btn btn-secondary" type="button" onClick={retryContact}>Reintentar contacto</button></div> : null}
            {!ready && <button type="button" className="btn btn-primary" disabled={checking || !verified || !contact}
                onClick={prepareInquiry}>{checking ? "Verificando selección…" : "Consultar disponibilidad por WhatsApp"}</button>}
            {ready && <section className={styles.summary} aria-label="Consulta preparada">
                <h2 ref={readyHeading} tabIndex={-1}>Datos verificados. Tu consulta está preparada.</h2>
                <p>Abre WhatsApp para revisar y enviar el mensaje. El carrito se conservará.</p>
                <PreparedWhatsAppLink contact={contact} message={prepared.message} label="Abrir WhatsApp con la consulta" />
            </section>}
            {confirmClear && <ConfirmDialog open title="¿Vaciar el carrito?" confirmLabel="Sí, vaciar carrito"
                onCancel={() => setConfirmClear(false)} onConfirm={() => { clear(); setConfirmClear(false); window.requestAnimationFrame(() => headingRef.current?.focus()); }}>
                <p>Se eliminarán todos los productos de tu selección local.</p>
            </ConfirmDialog>}
        </section>
    );
}
