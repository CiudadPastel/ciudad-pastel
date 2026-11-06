import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

const fake = vi.hoisted(() => ({
    verifyIdToken: vi.fn(),
    homeGet: vi.fn(),
    homeSet: vi.fn(),
    uploadHomeImage: vi.fn()
}));

vi.mock("../src/config/firebase.js", () => ({
    auth: { verifyIdToken: fake.verifyIdToken },
    db: { collection: vi.fn(() => ({ doc: vi.fn(() => ({ get: fake.homeGet, set: fake.homeSet })) })) }
}));
vi.mock("../src/services/home-image.service.js", async (importOriginal) => {
    const original = await importOriginal();
    return { ...original, uploadHomeImage: fake.uploadHomeImage };
});
import app from "../src/app.js";

const valid = {
    heroImageUrl: "https://example.com/hero.jpg",
    storeImageUrl: null,
    about: { visible: true, title: "Sobre nosotros", description: "Una historia de repostería.", imageUrl: null }
};

describe("API de la portada", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        fake.homeGet.mockResolvedValue({ exists: false });
        fake.homeSet.mockResolvedValue(undefined);
        fake.verifyIdToken.mockResolvedValue({ uid: "fixture", admin: true });
        fake.uploadHomeImage.mockResolvedValue({ url: "https://res.cloudinary.com/demo/image/upload/file.jpg", publicId: "fixture" });
    });

    it("sirve portada pública sin autenticación", async () => {
        const response = await request(app).get("/api/site/home");
        expect(response.status).toBe(200);
        expect(response.body.about.visible).toBe(false);
        expect(fake.verifyIdToken).not.toHaveBeenCalled();
    });
    it("bloquea edición anónima", async () => {
        const response = await request(app).put("/api/admin/site/home").send(valid);
        expect(response.status).toBe(401);
        expect(fake.homeSet).not.toHaveBeenCalled();
    });
    it("bloquea a usuarios sin permiso admin", async () => {
        fake.verifyIdToken.mockResolvedValue({ uid: "fixture", admin: false });
        const response = await request(app).put("/api/admin/site/home").set("Authorization", "Bearer test").send(valid);
        expect(response.status).toBe(403);
        expect(fake.homeSet).not.toHaveBeenCalled();
    });
    it("guarda campos permitidos con permisos", async () => {
        const response = await request(app).put("/api/admin/site/home").set("Authorization", "Bearer test").send({ ...valid, unknown: "removed" });
        expect(response.status).toBe(200);
        expect(response.body).not.toHaveProperty("unknown");
        expect(fake.homeSet).toHaveBeenCalledOnce();
        expect(fake.homeSet.mock.calls[0][0].heroImageUrl).toBe(valid.heroImageUrl);
    });
    it("rechaza una URL insegura", async () => {
        const response = await request(app).put("/api/admin/site/home").set("Authorization", "Bearer test").send({ ...valid, heroImageUrl: "data:image/svg+xml,test" });
        expect(response.status).toBe(400);
        expect(fake.homeSet).not.toHaveBeenCalled();
    });
    it("requiere admin y un archivo de imagen válido para Cloudinary", async () => {
        const anon = await request(app).post("/api/admin/site/home/image").attach("file", Buffer.from([255,216,255,1]), "a.jpg");
        expect(anon.status).toBe(401);
        const invalid = await request(app).post("/api/admin/site/home/image").set("Authorization", "Bearer test")
            .attach("file", Buffer.from("not an image"), "a.jpg");
        expect(invalid.status).toBe(400);
        expect(fake.uploadHomeImage).not.toHaveBeenCalled();
    });
});
