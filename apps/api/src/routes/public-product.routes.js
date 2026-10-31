import { Router } from "express";

import { getPublicProductById, getPublicProducts } from "../controllers/product.controller.js";

const router = Router();

// Public product catalog (CIU-132): no authentication required.
router.get("/", getPublicProducts);

// Public product detail (HU-T02): no authentication; hidden products return 404.
router.get("/:id", getPublicProductById);

export default router;
