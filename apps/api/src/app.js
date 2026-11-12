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
import studentAccessRoutes from "./routes/student-access.routes.js";
import { courseEnrollmentRoutes, enrollmentRoutes, publicEnrollmentRoutes } from "./routes/enrollment.routes.js";
import publicProductRoutes from "./routes/public-product.routes.js";
import publicCategoryRoutes from "./routes/public-category.routes.js";
import publicContactRoutes from "./routes/public-contact.routes.js";
import { adminHomeRoutes, publicHomeRoutes } from "./routes/home-content.routes.js";
import adminProductRoutes, { adminCategoryRoutes } from "./routes/admin-product.routes.js";


dotenv.config();

const app = express();

const rawFrontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
const allowedOrigins = rawFrontendUrl
    .split(",")
    .map((url) => url.trim().replace(/\/+$/, ""))
    .filter(Boolean);

// Enables requests from the configured frontend.
app.use(
    cors({
        origin: (origin, callback) => {
            if (!origin) return callback(null, true);
            const cleanOrigin = origin.replace(/\/+$/, "");
            if (
                allowedOrigins.includes(cleanOrigin) ||
                allowedOrigins.includes("*")
            ) {
                return callback(null, true);
            }
            callback(new Error(`CORS bloqueado: Origen no permitido (${origin})`));
        },
        credentials: true,
        methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allowedHeaders: ["Authorization", "Content-Type"]
    })
);


// Limits student verification attempts before parsing sensitive input.
app.use("/api/student-access", studentAccessRoutes);

// Parses incoming JSON request bodies for the remaining routes.
app.use(express.json());


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

// Confirmed enrollments of a course (HU-A09).
app.use(
    "/api/admin/courses/:courseId/enrollments",
    courseEnrollmentRoutes
);

// Confirmed enrollment changes (HU-A09).
app.use(
    "/api/admin/enrollments",
    enrollmentRoutes
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
app.use("/api/admin/products", adminProductRoutes);
app.use("/api/admin/categories", adminCategoryRoutes);

// Public published-course listing.
app.use("/api/courses", publicCourseRoutes);

// Public student enrollment payment status lookup (HU-A07).
app.use("/api/enrollments", publicEnrollmentRoutes);

// Public product catalog (HU-T01).
app.use("/api/products", publicProductRoutes);
app.use("/api/categories", publicCategoryRoutes);

// CMS for the editorial home page (authenticated writes, public reads).
app.use("/api/site", publicHomeRoutes);
app.use("/api/admin/site", adminHomeRoutes);

// Public environment-driven business contact configuration (CIU-154).
app.use("/api/contact", publicContactRoutes);

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
