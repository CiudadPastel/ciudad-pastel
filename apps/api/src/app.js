import express from "express";
import cors from "cors";
import dotenv from "dotenv";

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import swaggerUi from "swagger-ui-express";
import YAML from "yaml";

import { db } from "./config/firebase.js";

import {
    authenticateUser,
    requireAdmin
} from "./middleware/auth.middleware.js";

import courseRoutes from "./routes/course.routes.js";
import publicCourseRoutes from "./routes/public-course.routes.js";
import recipeBookRoutes from "./routes/recipe-book.routes.js";
import enrollmentRequestRoutes from "./routes/enrollment-request.routes.js";


dotenv.config();

const app = express();

const FRONTEND_URL =
    process.env.FRONTEND_URL || "http://localhost:5173";


// Resolves the API documentation file path.
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const openApiPath = path.join(
    __dirname,
    "../docs/openapi.yaml"
);


// Loads the OpenAPI specification from YAML.
const openApiDocument = YAML.parse(
    fs.readFileSync(openApiPath, "utf8")
);


// Enables requests from the configured frontend.
app.use(
    cors({
        origin: FRONTEND_URL,
        methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allowedHeaders: ["Authorization", "Content-Type"]
    })
);


// Parses incoming JSON request bodies.
app.use(express.json());


// Serves the interactive API documentation.
app.use(
    "/api/docs",
    swaggerUi.serve,
    swaggerUi.setup(openApiDocument)
);


// Recipe book administration routes.
app.use(
    "/api/admin/courses/:courseId/recipe-books",
    recipeBookRoutes
);

// Course administration routes.
app.use(
    "/api/admin/courses",
    courseRoutes
);


// Enrollment request administration routes (HU-A05).
app.use(
    "/api/admin/enrollment-requests",
    enrollmentRequestRoutes
);

// Public published-course listing.
app.use("/api/courses", publicCourseRoutes);

// Checks whether the API is running.
app.get("/api/health", (req, res) => {
    res.json({
        status: "ok",
        message: "Ciudad Pastel API is running"
    });
});


// Checks the connection with Firestore.
app.get(
    "/api/firebase/health",
    async (req, res) => {
        try {
            await db
                .collection("_connection_test")
                .limit(1)
                .get();

            res.json({
                status: "ok",
                message:
                    "Firebase Firestore connection successful"
            });
        } catch (error) {
            console.error(
                "Firebase connection error:",
                error
            );

            res.status(500).json({
                status: "error",
                message:
                    "Firebase Firestore connection failed"
            });
        }
    }
);


// Checks authentication and administrator privileges.
app.get(
    "/api/admin/health",
    authenticateUser,
    requireAdmin,
    (req, res) => {
        res.json({
            status: "ok",
            message:
                "Administrative access granted",
            user: {
                uid: req.user.uid,
                email: req.user.email
            }
        });
    }
);


export default app;
