import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { destroyHomeImage, homeCloudinaryConfig, uploadHomeImage } from "../src/services/home-image.service.js";
const asset = { id: "12345678-1234-1234-1234-123456789abc", publicId: "ciudad-pastel/home/12345678-1234-1234-1234-123456789abc",
    cloudName: "demo", resourceType: "image", deliveryType: "upload" };
const file = { originalname: "a.jpg", mimetype: "image/jpeg", buffer: Buffer.from([255,216,255,1]), size: 4 };
describe("backend Cloudinary transport", () => {
    beforeEach(() => {
        vi.stubEnv("CLOUDINARY_CLOUD_NAME", "demo"); vi.stubEnv("CLOUDINARY_API_KEY", "key"); vi.stubEnv("CLOUDINARY_API_SECRET", "test-secret");
        vi.stubGlobal("fetch", vi.fn());
    });
    afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
    it("validates configuration before upload", () => {
        vi.stubEnv("CLOUDINARY_API_SECRET", "");
        expect(() => homeCloudinaryConfig()).toThrow("not configured");
    });
    it("uses reserved IDs and persists secure URL and immutable asset ID", async () => {
        fetch.mockResolvedValue(Response.json({ secure_url: "https://res.cloudinary.com/demo/a.jpg", public_id: asset.publicId, asset_id: "immutable" }));
        expect(await uploadHomeImage(file, asset)).toEqual({ url: "https://res.cloudinary.com/demo/a.jpg", publicId: asset.publicId, assetId: "immutable" });
        const options = fetch.mock.calls[0][1];
        expect(options.body.get("public_id")).toBe(asset.publicId);
        expect(options.body.get("overwrite")).toBe("false");
        expect(options.headers.Authorization).toMatch(/^Basic /);
    });
    it.each([{ secure_url: "http://res.cloudinary.com/demo/a", public_id: asset.publicId, asset_id: "id" },
        { secure_url: "https://res.cloudinary.com.evil.test/a", public_id: asset.publicId, asset_id: "id" },
        { secure_url: "https://res.cloudinary.com/demo/a", public_id: "someone-else", asset_id: "id" }])("rejects untrusted Cloudinary metadata %j", async response => {
        fetch.mockResolvedValue(Response.json(response));
        await expect(uploadHomeImage(file, asset)).rejects.toThrow();
    });
    it("propagates failed uploads without requesting deletion", async () => {
        fetch.mockRejectedValue(new Error("timeout"));
        await expect(uploadHomeImage(file, asset)).rejects.toThrow("timeout");
        expect(fetch).toHaveBeenCalledOnce();
    });
    it.each([{ ...asset, publicId: "unowned" }, { ...asset, cloudName: "other" }, { ...asset, deliveryType: "private" }])("refuses unmanaged deletion %j", async ref => {
        await expect(destroyHomeImage(ref)).rejects.toThrow();
        expect(fetch).not.toHaveBeenCalled();
    });
    it("signs backend deletion and treats already removed resources as success", async () => {
        fetch.mockResolvedValue(Response.json({ result: "not found" }));
        await destroyHomeImage(asset);
        const body = fetch.mock.calls[0][1].body;
        expect(body.get("public_id")).toBe(asset.publicId);
        expect(body.get("signature")).toMatch(/^[a-f0-9]{40}$/);
        expect(body.has("api_secret")).toBe(false);
    });
    it("requires confirmed deletion, allowing retry on HTTP or API failure", async () => {
        fetch.mockResolvedValueOnce(Response.json({}, { status: 500 })).mockResolvedValueOnce(Response.json({ result: "error" }));
        await expect(destroyHomeImage(asset)).rejects.toThrow();
        await expect(destroyHomeImage(asset)).rejects.toThrow();
    });
});
