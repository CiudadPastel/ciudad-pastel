import { randomUUID } from "node:crypto";

const LIMIT = 5 * 1024 * 1024;
export const HOME_IMAGE_LIMIT_BYTES = LIMIT;

export function isSupportedHomeImage(file) {
    if (!file?.buffer || file.size <= 0 || file.size > LIMIT) return false;
    const b = file.buffer;
    if (file.mimetype === "image/jpeg") return b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
    if (file.mimetype === "image/png") return b.length >= 8 && b.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"));
    if (file.mimetype === "image/webp") return b.length >= 12 && b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP";
    return false;
}

/**
 * Backend-only authenticated Cloudinary upload. No unsigned preset and no API secret in the browser.
 * Cloudinary REST API supports Basic Auth for signed server-side uploads.
 */
export async function uploadHomeImage(file) {
    const cloud = process.env.CLOUDINARY_CLOUD_NAME?.trim();
    const key = process.env.CLOUDINARY_API_KEY?.trim();
    const secret = process.env.CLOUDINARY_API_SECRET?.trim();
    if (!cloud || !/^[a-zA-Z0-9_-]{1,64}$/.test(cloud) || !key || !secret) {
        const err = new Error("Cloudinary is not configured.");
        err.status = 503;
        throw err;
    }
    const data = new FormData();
    data.append("file", new Blob([file.buffer], { type: file.mimetype }), file.originalname || "image");
    data.append("asset_folder", "ciudad-pastel/home");
    data.append("public_id", randomUUID());
    data.append("overwrite", "false");
    let response;
    try {
        response = await fetch(`https://api.cloudinary.com/v1_1/${cloud}/image/upload`, {
            method: "POST",
            headers: { Authorization: `Basic ${Buffer.from(`${key}:${secret}`).toString("base64")}` },
            body: data,
            signal: AbortSignal.timeout(20000)
        });
    } catch {
        throw new Error("Cloudinary could not be reached.");
    }
    if (!response.ok) throw new Error("Cloudinary rejected the image upload.");
    const result = await response.json();
    if (!result || typeof result.secure_url !== "string" || !result.secure_url.startsWith("https://res.cloudinary.com/")) {
        throw new Error("Cloudinary returned an invalid image URL.");
    }
    return { url: result.secure_url, publicId: result.public_id };
}
