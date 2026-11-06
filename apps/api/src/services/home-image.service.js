import { createHash } from "node:crypto";

export const HOME_IMAGE_LIMIT_BYTES = 5 * 1024 * 1024;
export function isSupportedHomeImage(file) {
    if (!file?.buffer || file.size <= 0 || file.size > HOME_IMAGE_LIMIT_BYTES || file.buffer.length !== file.size) return false;
    const b = file.buffer;
    if (file.mimetype === "image/jpeg") return b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
    if (file.mimetype === "image/png") return b.length >= 8 && b.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"));
    if (file.mimetype === "image/webp") return b.length >= 12 && b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP";
    return false;
}

export function homeCloudinaryConfig() {
    const cloudName = process.env.CLOUDINARY_CLOUD_NAME?.trim();
    const key = process.env.CLOUDINARY_API_KEY?.trim();
    const secret = process.env.CLOUDINARY_API_SECRET?.trim();
    if (!cloudName || !/^[a-zA-Z0-9_-]{1,64}$/.test(cloudName) || !key || !secret) {
        throw Object.assign(new Error("Cloudinary is not configured."), { status: 503 });
    }
    return { cloudName, key, secret };
}

export async function uploadHomeImage(file, asset) {
    const { cloudName, key, secret } = homeCloudinaryConfig();
    if (asset.cloudName !== cloudName) throw new Error("Cloudinary account mismatch.");
    const data = new FormData();
    data.append("file", new Blob([file.buffer], { type: file.mimetype }), file.originalname || "image");
    data.append("public_id", asset.publicId);
    data.append("overwrite", "false");
    const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
        method: "POST", headers: { Authorization: `Basic ${Buffer.from(`${key}:${secret}`).toString("base64")}` },
        body: data, signal: AbortSignal.timeout(20000)
    });
    if (!response.ok) throw new Error("Cloudinary rejected the image upload.");
    const result = await response.json();
    const url = new URL(result.secure_url);
    if (url.protocol !== "https:" || url.hostname !== "res.cloudinary.com" || result.public_id !== asset.publicId || typeof result.asset_id !== "string" || !result.asset_id) {
        throw new Error("Cloudinary returned invalid image metadata.");
    }
    return { url: result.secure_url, publicId: result.public_id, assetId: result.asset_id };
}

// Only called with a backend-owned registry record, never request data.
export async function destroyHomeImage(asset) {
    const { cloudName, key, secret } = homeCloudinaryConfig();
    if (asset.cloudName !== cloudName || asset.resourceType !== "image" || asset.deliveryType !== "upload" ||
        !/^ciudad-pastel\/home\/[0-9a-f-]{36}$/.test(asset.publicId)) throw new Error("Unmanaged image.");
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = createHash("sha1").update(`public_id=${asset.publicId}&timestamp=${timestamp}${secret}`).digest("hex");
    const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/destroy`, {
        method: "POST", body: new URLSearchParams({ public_id: asset.publicId, timestamp, api_key: key, signature }),
        signal: AbortSignal.timeout(20000)
    });
    if (!response.ok) throw new Error("Cloudinary deletion failed.");
    const result = await response.json();
    if (!["ok", "not found"].includes(result.result)) throw new Error("Cloudinary deletion not confirmed.");
}
