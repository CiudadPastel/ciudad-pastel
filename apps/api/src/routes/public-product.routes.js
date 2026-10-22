import { Router } from "express";

import { getPublicProducts } from "../controllers/product.controller.js";

const router = Router();

// Public product catalog (CIU-132): no authentication required.
router.get("/", getPublicProducts);

export default router;
