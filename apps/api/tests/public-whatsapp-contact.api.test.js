import fs from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import YAML from "yaml";

const fake = vi.hoisted(() => ({
    verifyIdToken: vi.fn(() => { throw new Error("Authentication must not be invoked."); }),
    firestoreAccess: vi.fn(() => { throw new Error("Firestore access is forbidden."); }),
    getPublishedProducts: vi.fn(),
    getCategories: vi.fn()
}));

vi.mock("dotenv", () => ({ default: { config: vi.fn() } }));
vi.mock("firebase-admin/app", () => { throw new Error("Real Firebase access is forbidden."); });
vi.mock("firebase-admin/firestore", () => ({
    FieldValue: { serverTimestamp: fake.firestoreAccess },
    getFirestore: fake.firestoreAccess
}));
vi.mock("../src/config/firebase.js", () => ({
    auth: { verifyIdToken: fake.verifyIdToken },
    db: new Proxy({}, { get: () => fake.firestoreAccess })
}));
// Only repository boundaries are mocked. Contact routes, controller and service are real.
vi.mock("../src/repositories/product.repository.js", () => ({ getPublishedProducts: fake.getPublishedProducts }));
vi.mock("../src/repositories/category.repository.js", () => ({ getCategories: fake.getCategories }));

import app from "../src/app.js";
import { invalidateProductCatalogCache } from "../src/services/product.service.js";

const ENDPOINT = "/api/contact/whatsapp";
// Synthetic fixtures only; no contact or external WhatsApp request is made.
const PHONE = "+12025550123";
const FALLBACK = "Hola, quisiera información sobre {{productName}}.";
const NOT_CONFIGURED = { message: "WhatsApp contact is not configured." };
const INVALID = { message: "WhatsApp contact configuration is invalid." };
const readSpec = () => YAML.parseDocument(fs.readFileSync(new URL("../docs/openapi.yaml", import.meta.url), "utf8"));

describe("public WhatsApp contact configuration (CIU-154 / CIU-158)", () => {
    let logs;

    beforeEach(() => {
        vi.clearAllMocks();
        vi.stubEnv("WHATSAPP_CONTACT_PHONE", PHONE);
        vi.stubEnv("WHATSAPP_CONTACT_MESSAGE_TEMPLATE", undefined);
        invalidateProductCatalogCache();
        fake.getPublishedProducts.mockResolvedValue([]);
        fake.getCategories.mockResolvedValue([]);
        logs = ["error", "warn", "log"].map((method) => vi.spyOn(console, method).mockImplementation(() => {}));
    });

    afterEach(() => {
        try {
            expect(fake.verifyIdToken).not.toHaveBeenCalled();
            expect(fake.firestoreAccess).not.toHaveBeenCalled();
            for (const log of logs) expect(log).not.toHaveBeenCalled();
        } finally {
            vi.unstubAllEnvs();
            vi.restoreAllMocks();
            invalidateProductCatalogCache();
        }
    });

    function expectContact(response, phone = PHONE, messageTemplate = FALLBACK) {
        expect(response.status).toBe(200);
        expect(response.headers["content-type"]).toMatch(/application\/json/);
        expect(response.body).toEqual({ phone, messageTemplate });
        expect(Object.keys(response.body).sort()).toEqual(["messageTemplate", "phone"]);
        expect(response.body.messageTemplate).toContain("{{productName}}");
    }

    it.each([
        ["synthetic international phone", PHONE],
        ["non-Costa-Rican format", "+99912345678"],
        ["minimum structural length", "+1"],
        ["maximum 15 digits", "+123456789012345"]
    ])("returns the public contract for %s without Authorization", async (_name, phone) => {
        vi.stubEnv("WHATSAPP_CONTACT_PHONE", phone);
        expectContact(await request(app).get(ENDPOINT), phone);
        expect(fake.getPublishedProducts).not.toHaveBeenCalled();
        expect(fake.getCategories).not.toHaveBeenCalled();
    });

    it("trims outer whitespace while preserving custom Unicode, internal whitespace and placeholders", async () => {
        const template = "¡Hola! 🍰 Quisiera información de {{productName}}.\n¿Presentación y decoración?  Gracias.";
        vi.stubEnv("WHATSAPP_CONTACT_PHONE", " \t" + PHONE + "\n ");
        vi.stubEnv("WHATSAPP_CONTACT_MESSAGE_TEMPLATE", " \t" + template + "\n ");
        expectContact(await request(app).get(ENDPOINT), PHONE, template);
    });

    it.each([
        ["omitted", undefined], ["empty", ""], ["whitespace-only", " \t\n "]
    ])("uses the exact provisional fallback when the optional template is %s", async (_name, template) => {
        vi.stubEnv("WHATSAPP_CONTACT_MESSAGE_TEMPLATE", template);
        expectContact(await request(app).get(ENDPOINT));
    });

    it.each([
        ["undefined", undefined, undefined],
        ["empty", "", undefined],
        ["whitespace-only", " \t\n ", undefined],
        ["template alone", undefined, "Consulta sobre {{productName}}."]
    ])("returns only the safe 404 message for %s phone configuration", async (_name, phone, template) => {
        vi.stubEnv("WHATSAPP_CONTACT_PHONE", phone);
        vi.stubEnv("WHATSAPP_CONTACT_MESSAGE_TEMPLATE", template);
        const response = await request(app).get(ENDPOINT);
        expect(response.status).toBe(404);
        expect(response.body).toEqual(NOT_CONFIGURED);
        expect(response.body).not.toHaveProperty("phone");
        expect(response.text).not.toContain(PHONE);
    });

    it("returns 404 before validating an irrelevant template when no phone is configured", async () => {
        vi.stubEnv("WHATSAPP_CONTACT_PHONE", undefined);
        vi.stubEnv("WHATSAPP_CONTACT_MESSAGE_TEMPLATE", "invalid without placeholder");
        const response = await request(app).get(ENDPOINT);
        expect(response.status).toBe(404);
        expect(response.body).toEqual(NOT_CONFIGURED);
    });

    it.each([
        ["missing plus", "12025550123"],
        ["zero first digit", "+0123456789"],
        ["letters", "+1202555TEST"],
        ["embedded space", "+1202 5550123"],
        ["embedded newline", "+1202\n5550123"],
        ["hyphens", "+1-202-555-0123"],
        ["extra plus", "++12025550123"],
        ["embedded plus", "+1202+5550123"],
        ["too many digits", "+1234567890123456"],
        ["parentheses", "+1(202)5550123"],
        ["brackets", "+1[202]5550123"],
        ["non-ASCII digits", "+１２３４５６７８９"],
        ["no digits", "+"]
    ])("rejects %s without exposing or logging the invalid configuration", async (_name, phone) => {
        vi.stubEnv("WHATSAPP_CONTACT_PHONE", phone);
        const response = await request(app).get(ENDPOINT);
        expect(response.status).toBe(500);
        expect(response.body).toEqual(INVALID);
        expect(response.text).not.toContain(phone);
        expect(response.text).not.toContain("WHATSAPP_CONTACT_PHONE");
    });

    it.each([
        ["absent placeholder", "Hola, quisiera información."],
        ["incorrect placeholder case", "Hola {{productname}}."],
        ["over 1000 Unicode code points", "{{productName}}" + "🍰".repeat(986)]
    ])("returns a safe configuration error for a custom template with %s", async (_name, template) => {
        vi.stubEnv("WHATSAPP_CONTACT_MESSAGE_TEMPLATE", template);
        const response = await request(app).get(ENDPOINT);
        expect(response.status).toBe(500);
        expect(response.body).toEqual(INVALID);
        expect(response.text).not.toContain(template);
        expect(response.text).not.toContain(PHONE);
    });

    it("accepts exactly 1000 Unicode code points after trimming", async () => {
        const template = "{{productName}}" + "🍰".repeat(1000 - "{{productName}}".length);
        expect(Array.from(template)).toHaveLength(1000);
        vi.stubEnv("WHATSAPP_CONTACT_MESSAGE_TEMPLATE", "  " + template + "  ");
        expectContact(await request(app).get(ENDPOINT), PHONE, template);
    });

    it("treats templates as plain text without substituting product input or executing code", async () => {
        const template = '<b>{{productName}}</b> ${process.exit()} {{productName}}';
        vi.stubEnv("WHATSAPP_CONTACT_MESSAGE_TEMPLATE", template);
        expectContact(await request(app).get(ENDPOINT).query({ productName: "untrusted product" }), PHONE, template);
    });

    it("ignores an irrelevant invalid bearer token and never accesses Firebase", async () => {
        expectContact(await request(app).get(ENDPOINT).set("Authorization", "Bearer invalid-token"));
    });

    it("reads current configuration on each request without retaining prior phone or template state", async () => {
        const custom = "Información de {{productName}} 🍰";
        vi.stubEnv("WHATSAPP_CONTACT_MESSAGE_TEMPLATE", custom);
        expectContact(await request(app).get(ENDPOINT), PHONE, custom);
        vi.stubEnv("WHATSAPP_CONTACT_PHONE", undefined);
        expect((await request(app).get(ENDPOINT)).body).toEqual(NOT_CONFIGURED);
        vi.stubEnv("WHATSAPP_CONTACT_PHONE", "+1234567890123456");
        expect((await request(app).get(ENDPOINT)).body).toEqual(INVALID);
        vi.stubEnv("WHATSAPP_CONTACT_PHONE", "+99912345678");
        vi.stubEnv("WHATSAPP_CONTACT_MESSAGE_TEMPLATE", undefined);
        expectContact(await request(app).get(ENDPOINT), "+99912345678");
    });

    it("preserves health and public catalog routes with contact configuration missing", async () => {
        vi.stubEnv("WHATSAPP_CONTACT_PHONE", undefined);
        const health = await request(app).get("/api/health");
        expect(health.status).toBe(200);
        expect(health.body).toEqual({ status: "ok", message: "Ciudad Pastel API is running" });
        const products = await request(app).get("/api/products");
        expect(products.status).toBe(200);
        expect(products.body).toEqual({ items: [], products: [], total: 0, page: 1, limit: 12, hasMore: false });
        const categories = await request(app).get("/api/categories");
        expect(categories.status).toBe(200);
        expect(categories.body).toEqual([]);
        expect((await request(app).get("/api/products?categoryId=unknown")).status).toBe(200);
    });

    it("documents public access, exact responses and valid local OpenAPI references", async () => {
        const document = readSpec();
        expect(document.errors).toEqual([]);
        const spec = document.toJS();
        const operation = spec.paths["/contact/whatsapp"].get;
        expect(operation.security).toEqual([]);
        expect(operation.tags).toContain("Contact");
        expect(Object.keys(operation.responses).sort()).toEqual(["200", "404", "500"]);
        const resolve = (ref) => ref.slice(2).split("/").reduce((value, part) =>
            value?.[part.replace(/~1/g, "/").replace(/~0/g, "~")], spec);
        function validateReferences(value) {
            if (!value || typeof value !== "object") return;
            if (value.$ref?.startsWith("#/")) expect(resolve(value.$ref), value.$ref).toBeDefined();
            Object.values(value).forEach(validateReferences);
        }
        validateReferences(spec);

        const schemaFor = (status) => resolve(operation.responses[status].content["application/json"].schema.$ref);
        const success = schemaFor("200");
        expect(success.required).toEqual(["phone", "messageTemplate"]);
        expect(success.additionalProperties).toBe(false);
        const configured = await request(app).get(ENDPOINT);
        expectContact(configured);
        expect(Object.keys(configured.body).sort()).toEqual(Object.keys(success.properties).sort());
        expect(configured.body.phone).toMatch(new RegExp(success.properties.phone.pattern));
        expect(configured.body.messageTemplate).toMatch(new RegExp(success.properties.messageTemplate.pattern));
        expect(success.properties.messageTemplate.maxLength).toBe(1000);

        for (const [phone, status] of [[undefined, "404"], ["invalid-test-value", "500"]]) {
            vi.stubEnv("WHATSAPP_CONTACT_PHONE", phone);
            const response = await request(app).get(ENDPOINT);
            const schema = schemaFor(status);
            expect(response.status).toBe(Number(status));
            expect(schema.required).toEqual(["message"]);
            expect(schema.additionalProperties).toBe(false);
            expect(response.body).toEqual({ message: schema.properties.message.enum[0] });
        }
    });
});
