import { Router } from "express";
import { getWhatsAppContact } from "../controllers/contact.controller.js";

const router = Router();

// Public configuration: no authentication or student verification required.
router.get("/whatsapp", getWhatsAppContact);

export default router;
