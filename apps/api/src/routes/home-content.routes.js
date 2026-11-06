import { Router } from "express";
import multer from "multer";
import { authenticateUser, requireAdmin } from "../middleware/auth.middleware.js";
import { getHomeContent, saveHomeContent } from "../repositories/home-content.repository.js";
import { validateHomeContent } from "../validators/home-content.validator.js";
import { HOME_IMAGE_LIMIT_BYTES, isSupportedHomeImage, uploadHomeImage } from "../services/home-image.service.js";

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

adminHomeRoutes.get("/home", async (_req, res) => {
    try {
        res.set("Cache-Control", "no-store");
        res.json(await getHomeContent());
    } catch (error) {
        console.error("Admin home content failed:", error);
        res.status(500).json({ message: "Could not load home content." });
    }
});

adminHomeRoutes.put("/home", async (req, res) => {
    const parsed = validateHomeContent(req.body);
    if (!parsed.valid) {
        return res.status(400).json({ message: "Invalid home content.", errors: parsed.errors });
    }
    try {
        res.json(await saveHomeContent(parsed.data));
    } catch (error) {
        console.error("Save home content failed:", error);
        res.status(500).json({ message: "Could not save home content." });
    }
});

const singleImage = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: HOME_IMAGE_LIMIT_BYTES, files: 1, fields: 0 }
}).single("file");

adminHomeRoutes.post("/home/image", (req, res, next) => {
    singleImage(req, res, (error) => {
        if (!error) return next();
        if (error.code === "LIMIT_FILE_SIZE") return res.status(413).json({ message: "Image must not exceed 5 MiB." });
        if (error instanceof multer.MulterError) return res.status(400).json({ message: "Only one image file is allowed." });
        console.error("Image upload parsing failed:", error);
        return res.status(500).json({ message: "Could not process image." });
    });
}, async (req, res) => {
    if (!isSupportedHomeImage(req.file)) {
        return res.status(400).json({ message: "Only JPEG, PNG and WebP images up to 5 MiB are allowed." });
    }
    try {
        res.status(201).json(await uploadHomeImage(req.file));
    } catch (error) {
        if (error.status === 503) return res.status(503).json({ message: "Image upload is not configured." });
        console.error("Home image upload failed:", error);
        res.status(502).json({ message: "Could not upload image." });
    }
});
