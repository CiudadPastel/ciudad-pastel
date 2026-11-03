import { Router } from "express";
import {
    authenticateUser,
    requireAdmin
} from "../middleware/auth.middleware.js";
import {
    getAdminProducts,
    getAdminProductById,
    createAdminProduct,
    updateAdminProduct,
    getAdminCategories
} from "../controllers/admin-product.controller.js";

export const adminProductRoutes = Router();
adminProductRoutes.use(authenticateUser, requireAdmin);
adminProductRoutes.get("/", getAdminProducts);
adminProductRoutes.get("/:id", getAdminProductById);
adminProductRoutes.post("/", createAdminProduct);
adminProductRoutes.put("/:id", updateAdminProduct);

export const adminCategoryRoutes = Router();
adminCategoryRoutes.use(authenticateUser, requireAdmin);
adminCategoryRoutes.get("/", getAdminCategories);

export default adminProductRoutes;
