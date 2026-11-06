import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
vi.mock("../src/config/firebase.js", () => import("./helpers/home-firestore.js"));
vi.mock("../src/services/home-image.service.js", async original => ({ ...await original(),
    uploadHomeImage: vi.fn(), destroyHomeImage: vi.fn(), homeCloudinaryConfig: () => ({ cloudName: "demo" }) }));
import { state, resetStore, auth, db } from "./helpers/home-firestore.js";
import { uploadHomeImage, destroyHomeImage } from "../src/services/home-image.service.js";
import { cleanupHomeImages, getHomeContent } from "../src/repositories/home-content.repository.js";
import app from "../src/app.js";
const valid = { heroImageUrl: "https://example.com/hero.jpg", storeImageUrl: null,
    about: { visible: true, title: "Sobre nosotros", description: "Nuestra historia.", imageUrl: null } };
const save = body => request(app).put("/api/admin/site/home").set("Authorization", "Bearer test").send(body);
const upload = body => request(app).put("/api/admin/site/home").set("Authorization", "Bearer test")
    .field("content", JSON.stringify(body)).attach("heroImageUrl", Buffer.from([255,216,255,1]), "a.jpg");
const ledger = () => [...state.docs.entries()].filter(([key]) => key.includes("image_assets"));

describe("home publication and owned image lifecycle", () => {
    beforeEach(() => {
        vi.clearAllMocks(); resetStore();
        uploadHomeImage.mockImplementation(async (_file, asset) => ({ url: `https://res.cloudinary.com/demo/${asset.id}.jpg`, publicId: asset.publicId, assetId: asset.id }));
        destroyHomeImage.mockResolvedValue(undefined);
    });
    it("serves public defaults without authentication", async () => {
        expect((await request(app).get("/api/site/home")).body.about.visible).toBe(false);
        expect(auth.verifyIdToken).not.toHaveBeenCalled();
    });
    it("blocks anonymous and non-admin reads, writes and uploads", async () => {
        for (const method of ["get", "put", "post"]) {
            const path = method === "post" ? "/api/admin/site/home/image" : "/api/admin/site/home";
            expect((await request(app)[method](path).send(valid)).status).toBe(401);
            auth.verifyIdToken.mockResolvedValue({ uid: "user", admin: false });
            expect((await request(app)[method](path).set("Authorization", "Bearer test").send(valid)).status).toBe(403);
        }
        expect(uploadHomeImage).not.toHaveBeenCalled(); expect(destroyHomeImage).not.toHaveBeenCalled();
    });
    it("roundtrips URLs at site_content/home and strips client-owned metadata", async () => {
        const response = await save({ ...valid, imageAssets: { evil: { publicId: "arbitrary" } } });
        expect(response.status).toBe(200);
        expect(db.collection).toHaveBeenCalledWith("site_content");
        expect(state.docs.get("site_content/home").imageAssets).toEqual({});
        expect((await request(app).get("/api/site/home")).body).toEqual({ ...valid, revision: 1 });
    });
    it("uploads on save, persists metadata and only then deletes the replaced resource", async () => {
        const first = await upload(valid); expect(first.status).toBe(200);
        const old = ledger()[0][1];
        expect(Object.values(state.docs.get("site_content/home").imageAssets)[0].assetId).toBe(old.assetId);
        destroyHomeImage.mockImplementation(async asset => {
            expect(state.docs.get("site_content/home").heroImageUrl).not.toBe(asset.url);
        });
        const second = await upload(first.body); expect(second.status).toBe(200);
        expect(second.body.heroImageUrl).not.toBe(first.body.heroImageUrl);
        expect((await getHomeContent()).heroImageUrl).toBe(second.body.heroImageUrl);
        expect(destroyHomeImage).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ publicId: old.publicId }));
    });
    it("preserves shared resources until the last block releases them", async () => {
        const first = (await upload(valid)).body;
        const shared = (await save({ ...first, storeImageUrl: first.heroImageUrl })).body;
        expect((await save({ ...shared, heroImageUrl: valid.heroImageUrl })).status).toBe(200);
        expect(destroyHomeImage).not.toHaveBeenCalled();
        expect((await save({ ...(await getHomeContent()), storeImageUrl: null })).status).toBe(200);
        expect(destroyHomeImage).toHaveBeenCalledOnce();
    });
    it("never deletes external or legacy URL-only resources", async () => {
        state.docs.set("site_content/home", { ...valid, heroImageUrl: "https://res.cloudinary.com/demo/legacy.jpg" });
        expect((await save(valid)).status).toBe(200);
        expect(destroyHomeImage).not.toHaveBeenCalled();
    });
    it("retains the prior publication if Firestore fails after upload; reclaims pending later", async () => {
        const first = (await upload(valid)).body;
        uploadHomeImage.mockImplementationOnce(async (_file, asset) => {
            state.failCommit = true;
            return { url: `https://res.cloudinary.com/demo/${asset.id}.jpg`, assetId: asset.id };
        });
        expect((await upload(first)).status).toBe(502);
        expect(state.docs.get("site_content/home").heroImageUrl).toBe(first.heroImageUrl);
        expect(destroyHomeImage).not.toHaveBeenCalled();
        state.failCommit = false;
        await cleanupHomeImages(Date.now() + 3600_001);
        expect(destroyHomeImage).toHaveBeenCalledOnce();
        expect(destroyHomeImage.mock.calls[0][0].publicId).not.toBe(ledger()[0][1].publicId);
    });
    it("does not delete the previous image when the publication transaction fails", async () => {
        const first = (await upload(valid)).body;
        state.failTransaction = true;
        expect((await upload(first)).status).toBe(502);
        expect((await getHomeContent()).heroImageUrl).toBe(first.heroImageUrl);
        expect(destroyHomeImage).not.toHaveBeenCalled();
        state.failTransaction = false;
        await cleanupHomeImages(Date.now() + 3600_001);
        expect(destroyHomeImage).toHaveBeenCalledOnce();
        expect(destroyHomeImage.mock.calls[0][0].url).not.toBe(first.heroImageUrl);
    });
    it("never reintroduces resources already claimed for deletion", async () => {
        const first = (await upload(valid)).body;
        expect((await save({ ...first, heroImageUrl: null })).status).toBe(200);
        expect((await save({ ...(await getHomeContent()), heroImageUrl: first.heroImageUrl })).status).toBe(409);
    });
    it("journals lost upload responses and retries failed cleanup", async () => {
        uploadHomeImage.mockRejectedValueOnce(new Error("lost response"));
        expect((await upload(valid)).status).toBe(502);
        expect(state.docs.has("site_content/home")).toBe(false);
        await cleanupHomeImages(); expect(destroyHomeImage).not.toHaveBeenCalled();
        destroyHomeImage.mockRejectedValueOnce(new Error("offline"));
        await cleanupHomeImages(Date.now() + 3600_001);
        expect(ledger()[0][1].state).toBe("deleting");
        await cleanupHomeImages(Date.now() + 3600_001);
        expect(ledger()[0][1].state).toBe("deleted");
    });
    it("publishes all three image blocks in a single save", async () => {
        const response = await request(app).put("/api/admin/site/home").set("Authorization", "Bearer test")
            .field("content", JSON.stringify(valid))
            .attach("heroImageUrl", Buffer.from([255,216,255,1]), "hero.jpg")
            .attach("storeImageUrl", Buffer.from([255,216,255,2]), "store.jpg")
            .attach("aboutImageUrl", Buffer.from([255,216,255,3]), "about.jpg");
        expect(response.status).toBe(200);
        expect(new Set([response.body.heroImageUrl, response.body.storeImageUrl, response.body.about.imageUrl]).size).toBe(3);
        expect(Object.keys(state.docs.get("site_content/home").imageAssets)).toHaveLength(3);
        expect((await getHomeContent()).about.imageUrl).toBe(response.body.about.imageUrl);
        expect(destroyHomeImage).not.toHaveBeenCalled();
    });
    it("a failed second upload never publishes a partial set of images", async () => {
        const first = (await save(valid)).body;
        uploadHomeImage.mockImplementationOnce(async (_file, asset) => ({ url: `https://res.cloudinary.com/demo/${asset.id}.jpg`, assetId: asset.id }))
            .mockRejectedValueOnce(new Error("second upload failed"));
        const response = await request(app).put("/api/admin/site/home").set("Authorization", "Bearer test")
            .field("content", JSON.stringify(first))
            .attach("heroImageUrl", Buffer.from([255,216,255,1]), "hero.jpg")
            .attach("storeImageUrl", Buffer.from([255,216,255,2]), "store.jpg");
        expect(response.status).toBe(502);
        expect((await getHomeContent()).heroImageUrl).toBe(first.heroImageUrl);
        expect(ledger()).toHaveLength(2);
        await cleanupHomeImages(Date.now() + 3600_001);
        expect(destroyHomeImage).toHaveBeenCalledTimes(2);
    });
    it("rejects oversized files before contacting Cloudinary", async () => {
        const response = await request(app).put("/api/admin/site/home").set("Authorization", "Bearer test")
            .field("content", JSON.stringify(valid)).attach("heroImageUrl", Buffer.alloc(5 * 1024 * 1024 + 1), "large.jpg");
        expect(response.status).toBe(413);
        expect(uploadHomeImage).not.toHaveBeenCalled();
    });
    it("admin access reclaims expired pending resources without failing the read on deletion error", async () => {
        uploadHomeImage.mockRejectedValueOnce(new Error("upload failed"));
        await upload(valid);
        const [path, record] = ledger()[0];
        state.docs.set(path, { ...record, createdAt: Date.now() - 3600_001 });
        destroyHomeImage.mockRejectedValueOnce(new Error("cloud offline"));
        const response = await request(app).get("/api/admin/site/home").set("Authorization", "Bearer test");
        expect(response.status).toBe(200);
        expect(ledger()[0][1].state).toBe("deleting");
    });
    it("rejects stale and concurrent edits, including repeated save requests", async () => {
        const responses = await Promise.all([save(valid), save(valid)]);
        expect(responses.map(r => r.status).sort()).toEqual([200, 409]);
        expect((await upload(valid)).status).toBe(409);
        expect(uploadHomeImage).not.toHaveBeenCalled();
    });
    it("rejects invalid files and URLs before uploading; old upload route cannot create orphans", async () => {
        expect((await save({ ...valid, heroImageUrl: "http://unsafe.test/a.jpg" })).status).toBe(400);
        const response = await request(app).put("/api/admin/site/home").set("Authorization", "Bearer test")
            .field("content", JSON.stringify(valid)).attach("heroImageUrl", Buffer.from("invalid"), "a.jpg");
        expect(response.status).toBe(400);
        expect((await request(app).post("/api/admin/site/home/image").set("Authorization", "Bearer test")).status).toBe(409);
        expect(uploadHomeImage).not.toHaveBeenCalled(); expect(ledger()).toEqual([]);
    });
});
