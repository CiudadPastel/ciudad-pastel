import express from "express";
import cors from "cors";
import dotenv from "dotenv";

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

app.listen(PORT, () => {
    console.log(`API running on http://localhost:${PORT}`);
});