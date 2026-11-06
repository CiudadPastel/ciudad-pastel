import { test } from "node:test";
import assert from "node:assert/strict";
import { applyCartAction, decodeCart, MAX_CART_PRODUCTS, MAX_CART_QUANTITY, productSnapshot, validQuantity } from "../src/utils/cart.js";
import { buildCartAvailabilityMessage, buildIndividualAvailabilityMessage, buildWhatsAppLink, buildWhatsAppProductLink, MAX_WHATSAPP_URL_LENGTH } from "../src/utils/whatsapp.js";

const product = { id: "flour", name: "Harina & repostería + cacao 🍰", price: 2500, imageUrl: null, available: true };
const contact = { phone: "+50622223333", messageTemplate: "Consulta genérica sobre {{productName}}." };
const add = (items, value = product) => applyCartAction(items, { type: "add", product: value }).items;

test("new and repeated products merge by ID, never by name", () => {
    let items = add([]);
    assert.equal(items[0].quantity, 1);
    items = add(items, { ...product, name: "Nombre actualizado" });
    assert.equal(items.length, 1);
    assert.equal(items[0].quantity, 2);
    assert.equal(items[0].name, "Nombre actualizado");
    assert.equal(add(items, { ...product, id: "another" }).length, 2);
});
test("only positive integer quantities up to the documented maximum", () => {
    const items = add([]);
    for (const quantity of [0, -1, 1.5, NaN, Infinity, "2", MAX_CART_QUANTITY + 1]) {
        assert.equal(validQuantity(quantity), false);
        assert.deepEqual(applyCartAction(items, { type: "quantity", id: product.id, quantity }).items, items);
    }
    const updated = applyCartAction(items, { type: "quantity", id: product.id, quantity: MAX_CART_QUANTITY }).items;
    assert.equal(add(updated)[0].quantity, MAX_CART_QUANTITY);
});
test("distinct product limit, explicit remove and clear", () => {
    let items = [];
    for (let i = 0; i < MAX_CART_PRODUCTS + 1; i++) items = add(items, { ...product, id: String(i) });
    assert.equal(items.length, MAX_CART_PRODUCTS);
    items = applyCartAction(items, { type: "remove", id: "0" }).items;
    assert.equal(items.length, MAX_CART_PRODUCTS - 1);
    assert.deepEqual(applyCartAction(items, { type: "clear" }).items, []);
});
test("storage roundtrip keeps only minimal snapshot fields", () => {
    const items = add([], { ...product, token: "never-store", phone: "never-store", description: "unnecessary" });
    assert.deepEqual(decodeCart(JSON.stringify(items)), { items, invalid: false });
    assert.deepEqual(Object.keys(items[0]), ["id", "name", "price", "imageUrl", "available", "quantity"]);
});
test("corrupt, oversized and unexpected storage is recoverable", () => {
    for (const raw of ["{", "null", "{}", '"text"', "x".repeat(50_001), JSON.stringify([null, {}, { ...product, quantity: -1 }])]) {
        assert.equal(decodeCart(raw).invalid, true);
        assert.deepEqual(decodeCart(raw).items, []);
    }
    assert.deepEqual(decodeCart(null), { items: [], invalid: false });
});
test("duplicate stored IDs merge and invalid lines are discarded", () => {
    const restored = decodeCart(JSON.stringify([{ ...product, quantity: 2 }, { ...product, quantity: 3 }, { id: 123 }]));
    assert.equal(restored.invalid, true);
    assert.equal(restored.items.length, 1);
    assert.equal(restored.items[0].quantity, 5);
});
test("snapshot type and image validation", () => {
    assert.equal(productSnapshot({ ...product, available: "true" }), null);
    assert.equal(productSnapshot({ ...product, price: "2500" }), null);
    assert.equal(productSnapshot({ ...product, id: "" }), null);
    assert.equal(productSnapshot({ ...product, imageUrl: "javascript:alert(1)" }).imageUrl, null);
    assert.equal(productSnapshot({ ...product, imageUrl: "https://example.test/flour.png" }).imageUrl, "https://example.test/flour.png");
});
test("refresh preserves quantities and does not resurrect removed products", () => {
    const items = add(add([]));
    const results = [{ id: product.id, status: "verified", product: { ...product, price: 3000, available: false } },
        { id: "deleted", status: "verified", product: { ...product, id: "deleted" } }];
    const updated = applyCartAction(items, { type: "refresh", results }).items;
    assert.equal(updated.length, 1);
    assert.equal(updated[0].price, 3000);
    assert.equal(updated[0].available, false);
    assert.equal(updated[0].quantity, 2);
});
test("individual inquiry always asks availability for one unit", () => {
    const message = buildIndividualAvailabilityMessage(product);
    assert.ok(message.includes(`${product.name} (1 unidad)`));
    assert.ok(!/precio|cotiz|reservad|pedido/i.test(message));
});
test("joint inquiry contains exactly selected names and quantities", () => {
    const items = [{ ...product, quantity: 2 }, { ...product, id: "color", name: "Colorante rojo", quantity: 3 }];
    const message = buildCartAvailabilityMessage(items);
    assert.ok(message.includes(`- 2 × ${product.name}\n- 3 × Colorante rojo`));
    assert.equal(message.match(/Harina/g).length, 1);
    assert.ok(!/precio|cotiz|reservad|pedido/i.test(message));
    assert.equal(buildCartAvailabilityMessage([]), "");
});
test("configured phone, URL encoding and generic template remain compatible", () => {
    const message = buildCartAvailabilityMessage([{ ...product, quantity: 2 }]);
    const url = new URL(buildWhatsAppLink(contact, message));
    assert.equal(url.pathname, "/50622223333");
    assert.equal(url.searchParams.get("text"), message);
    assert.equal(new URL(buildWhatsAppProductLink(contact, product.name)).searchParams.get("text"), `Consulta genérica sobre ${product.name}.`);
    assert.equal(buildWhatsAppLink(null, message), null);
    assert.equal(buildWhatsAppLink({ ...contact, phone: "javascript:alert(1)" }, message), null);
});
test("long messages are not truncated; no oversized URL is produced", () => {
    const message = "á🍰".repeat(MAX_WHATSAPP_URL_LENGTH);
    assert.equal(buildWhatsAppLink(contact, message), null);
    assert.equal(buildWhatsAppLink(contact), "https://wa.me/50622223333");
    assert.ok(buildWhatsAppLink(contact, "\ud800").includes("%EF%BF%BD"));
});
