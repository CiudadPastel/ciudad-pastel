import { describe, expect, it } from "vitest";
import { HOME_DEFAULTS, normalizeHomeContent, validateHomeContent } from "../src/validators/home-content.validator.js";
import { isSupportedHomeImage } from "../src/services/home-image.service.js";

const valid = () => ({
    heroImageUrl: "https://example.com/image.jpg",
    storeImageUrl: null,
    about: { title: "Nuestra historia", description: "Somos Ciudad Pastel.", visible: true, imageUrl: null }
});

describe("contenido administrable de portada", () => {
    it("comienza con sobre nosotros oculto", () => {
        expect(normalizeHomeContent(null)).toEqual(HOME_DEFAULTS);
    });

    it("acepta contenido completo con enlaces HTTPS", () => {
        const result = validateHomeContent(valid());
        expect(result.valid).toBe(true);
        expect(result.data).toEqual(valid());
    });

    it.each(["javascript:alert(1)", "file:///tmp/test.png", "http://example.com/a.png", "https://user:pass@example.com/a.jpg"])(
        "rechaza URL no permitida %s", url => {
            const result = validateHomeContent({ ...valid(), heroImageUrl: url });
            expect(result.valid).toBe(false);
        }
    );

    it("exige descripción si se muestra la sección sobre nosotros", () => {
        const result = validateHomeContent({ ...valid(), about: { title: "Historia", description: "", visible: true, imageUrl: null } });
        expect(result.valid).toBe(false);
    });

    it("elimina campos desconocidos antes de guardar", () => {
        const result = validateHomeContent({ ...valid(), admin: true, about: { ...valid().about, html: "<script>bad</script>" } });
        expect(result.valid).toBe(true);
        expect(result.data).not.toHaveProperty("admin");
        expect(result.data.about).not.toHaveProperty("html");
    });

    it("no expone enlaces inválidos de datos heredados", () => {
        const result = normalizeHomeContent({ heroImageUrl: "javascript:bad", about: { visible: true, title: "Sobre nosotros", description: "Historia", imageUrl: "ftp://bad" } });
        expect(result.heroImageUrl).toBe(null);
        expect(result.about.imageUrl).toBe(null);
        expect(result.about.visible).toBe(true);
    });
});

describe("validación de archivos de portada", () => {
    it("acepta una cabecera JPEG real", () => {
        expect(isSupportedHomeImage({ mimetype: "image/jpeg", size: 5, buffer: Buffer.from([255,216,255,224,0]) })).toBe(true);
    });
    it("rechaza archivos que solo simulan ser imágenes", () => {
        expect(isSupportedHomeImage({ mimetype: "image/png", size: 5, buffer: Buffer.from("hello") })).toBe(false);
        expect(isSupportedHomeImage({ mimetype: "image/svg+xml", size: 3, buffer: Buffer.from("<svg") })).toBe(false);
        expect(isSupportedHomeImage({ mimetype: "image/jpeg", size: 6 * 1024 * 1024, buffer: Buffer.alloc(4) })).toBe(false);
    });
});
