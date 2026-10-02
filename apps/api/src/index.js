import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { db } from "./config/firebase.js";

dotenv.config();

const app = express();

const PORT = process.env.PORT || 3000;
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";

app.use(
    cors({
        origin: FRONTEND_URL
    })
);

app.use(express.json());

app.get("/api/health", (req, res) => {
    res.json({
        status: "ok",
        message: "Ciudad Pastel API is running"
    });
});

app.get("/api/firebase/health", async (req, res) => {
    try {
        await db.collection("_connection_test").limit(1).get();

        res.json({
            status: "ok",
            message: "Firebase Firestore connection successful"
        });
    } catch (error) {
        console.error("Firebase connection error:", error);

        res.status(500).json({
            status: "error",
            message: "Firebase Firestore connection failed"
        });
    }
});

app.listen(PORT, () => {
    console.log(`API running on http://localhost:${PORT}`);
});