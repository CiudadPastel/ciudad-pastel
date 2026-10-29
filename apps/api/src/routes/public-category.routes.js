import { Router } from "express";
import { listPublicCategories } from "../controllers/category.controller.js";

const router = Router();

// Public categories (CIU-143): no authentication required.
router.get("/", listPublicCategories);

export default router;
