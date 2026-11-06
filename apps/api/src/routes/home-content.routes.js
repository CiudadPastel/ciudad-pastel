import { Router } from "express";
import multer from "multer";
import { authenticateUser, requireAdmin } from "../middleware/auth.middleware.js";
import { cleanupHomeImages, getHomeContent, saveHomeContent, reserveHomeImage, recordHomeImage } from "../repositories/home-content.repository.js";
import { validateHomeContent } from "../validators/home-content.validator.js";
import { HOME_IMAGE_LIMIT_BYTES, isSupportedHomeImage, uploadHomeImage, homeCloudinaryConfig } from "../services/home-image.service.js";

export const publicHomeRoutes = Router();
publicHomeRoutes.get("/home", async (_req, res) => {
    try {
        res.set("Cache-Control", "no-store");
        res.json(await getHomeContent());
    } catch (error) {
        console.error("Public home content failed:", error);
        res.status(500).json({ message: "Could not load home content." });
    }
});

export const adminHomeRoutes = Router();
adminHomeRoutes.use(authenticateUser, requireAdmin);
async function cleanup() {
    try { await cleanupHomeImages(); }
    catch (error) { console.error("Home cleanup deferred:", error.message); }
}
adminHomeRoutes.get("/home", async (_req, res) => {
    try {
        await cleanup();
        res.set("Cache-Control", "no-store");
        res.json(await getHomeContent());
    } catch (error) {
        console.error("Admin home content failed:", error);
        res.status(500).json({ message: "Could not load home content." });
    }
});
const parseImages = multer({ storage: multer.memoryStorage(),
    limits: { fileSize: HOME_IMAGE_LIMIT_BYTES, files: 3, fields: 1, fieldSize: 32 * 1024 }
}).fields(["heroImageUrl", "storeImageUrl", "aboutImageUrl"].map(name => ({ name, maxCount: 1 })));

adminHomeRoutes.put("/home", (req, res, next) => {
    if (!req.is("multipart/form-data")) return next();
    parseImages(req, res, error => {
        if (!error) return next();
        res.status(error.code === "LIMIT_FILE_SIZE" ? 413 : 400).json({ message: "Invalid image upload. Maximum 5 MiB per image." });
    });
}, async (req, res) => {
    let input = req.body;
    try { if (req.is("multipart/form-data")) input = JSON.parse(req.body.content); }
    catch { return res.status(400).json({ message: "Invalid home content." }); }
    const parsed = validateHomeContent(input);
    if (!parsed.valid) return res.status(400).json({ message: "Invalid home content.", errors: parsed.errors });
    const revision = input.revision ?? 0;
    if (!Number.isSafeInteger(revision) || revision < 0) return res.status(400).json({ message: "Invalid revision." });
    const files = Object.entries(req.files || {}).map(([field, values]) => [field, values[0]]);
    if (files.some(([, file]) => !isSupportedHomeImage(file))) {
        return res.status(400).json({ message: "Only JPEG, PNG and WebP images up to 5 MiB are allowed." });
    }
    try {
        // Check before uploading, then check again atomically on publication.
        if ((await getHomeContent()).revision !== revision) return res.status(409).json({ message: "Home changed. Reload before saving." });
        const uploaded = [];
        for (const [field, file] of files) {
            const asset = await reserveHomeImage(homeCloudinaryConfig().cloudName);
            const image = await recordHomeImage(asset, await uploadHomeImage(file, asset));
            uploaded.push(image);
            if (field === "aboutImageUrl") parsed.data.about.imageUrl = image.url;
            else parsed.data[field] = image.url;
        }
        const saved = await saveHomeContent(parsed.data, revision, uploaded);
        // Publication has committed. Cleanup failure must never report save failure.
        await cleanup();
        res.json(saved);
    } catch (error) {
        console.error("Save home content failed:", error.message);
        res.status(error.status || 502).json({ message: "Could not publish home content. Reload before retrying." });
    }
});

// Kept to reject old clients safely: uploads must belong to a publication.
adminHomeRoutes.post("/home/image", (_req, res) => {
    res.status(409).json({ message: "Upload images with PUT /home when saving changes." });
});
