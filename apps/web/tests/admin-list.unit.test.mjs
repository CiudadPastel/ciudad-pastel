import test from "node:test";
import assert from "node:assert/strict";
import { matchesSearch, sortRecords, paginateRecords, matchesRequestDates, adminReturnTo } from "../src/utils/adminList.js";

test("full and partial names ignore case, accents, word order and extra spaces", () => {
    for (const query of ["Repostería básica", "reposteria bas", "BÁSICA repos", "  basica   "]) {
        assert.equal(matchesSearch(["Repostería básica"], query), true);
    }
    assert.equal(matchesSearch(["Repostería básica"], "pan"), false);
    assert.equal(matchesSearch([null], ""), true);
    assert.equal(matchesSearch(["r-123", "Ana Mora", "105380021", "88887777"], "10538 ana"), true);
});
test("filtering the complete response precedes pagination, without mutating the source", () => {
    const source = Array.from({ length: 85 }, (_, id) => ({ id: String(id), name: `Producto ${id}`, status: id % 2 ? "published" : "withdrawn", price: 85 - id }));
    const filtered = sortRecords(source.filter((p) => p.status === "published" && matchesSearch([p.name], "producto")), "price-asc");
    const first = paginateRecords(filtered, 1), second = paginateRecords(filtered, 2), last = paginateRecords(filtered, 3);
    assert.equal(filtered.length, 42);
    assert.equal(first.items[0].id, "83");
    assert.equal(second.items.length, 20);
    assert.equal(last.items.length, 2);
    assert.equal(new Set([...first.items, ...second.items, ...last.items].map((p) => p.id)).size, 42);
    assert.equal(source[0].id, "0");
    const searched = source.filter((p) => matchesSearch([p.name], "producto 84"));
    assert.equal(paginateRecords(searched, 1).items[0].id, "84");
});
test("empty lists and invalid or stale page numbers produce safe pages", () => {
    for (const page of [null, "oops", "-2", "1.5", "99999999999999999999999"]) {
        assert.equal(paginateRecords([{ id: "one" }], page).page, 1);
    }
    assert.deepEqual(paginateRecords([], 15), { page: 1, pages: 1, items: [] });
});
test("sorts names, numeric prices, timestamps and deterministic ties", () => {
    const records = [{ id: "2", name: "Ázucar", price: 100, createdAt: "2026-10-02" }, { id: "1", name: "Harina", price: 9, createdAt: "2026-10-01" }];
    assert.equal(sortRecords(records, "name-asc")[0].id, "2");
    assert.equal(sortRecords(records, "price-asc")[0].id, "1");
    assert.equal(sortRecords(records, "price-desc")[0].id, "2");
    assert.equal(sortRecords(records, "created-desc")[0].id, "2");
    assert.equal(sortRecords(records, "created-asc")[0].id, "1");
    assert.equal(sortRecords([{ id: "2", price: null }, { id: "1", price: 0 }], "price-asc")[0].id, "1");
});
test("inclusive dates use Costa Rica calendar boundaries, including midnight", () => {
    assert.equal(matchesRequestDates("2026-11-01T05:59:59Z", "2026-10-31", "2026-10-31"), true);
    assert.equal(matchesRequestDates("2026-11-01T06:00:00Z", "2026-10-31", "2026-10-31"), false);
    assert.equal(matchesRequestDates("2026-11-01T06:00:00Z", "2026-11-01", ""), true);
    assert.equal(matchesRequestDates(null, "2026-11-01", ""), false);
    assert.equal(matchesRequestDates(null, "", ""), true);
    assert.equal(matchesRequestDates("invalid", "2026-11-01", ""), false);
});
test("return destinations retain filters while accepting only known local lists", () => {
    const url = "/admin/productos?q=azucar&categoria=1&pagina=2";
    assert.equal(adminReturnTo(url, "/admin/productos"), url);
    assert.equal(adminReturnTo("https://example.com", "/admin/productos"), "/admin/productos");
    assert.equal(adminReturnTo("//example.com", "/admin/productos"), "/admin/productos");
    assert.equal(adminReturnTo(null, "/admin/cursos"), "/admin/cursos");
});
