import { auth } from "../config/firebase.js";

export async function authenticateUser(req, res, next) {
    try {
        const authorizationHeader = req.headers.authorization;

        if (
            !authorizationHeader ||
            !authorizationHeader.startsWith("Bearer ")
        ) {
            return res.status(401).json({
                message: "Authentication required"
            });
        }

        const token = authorizationHeader.split("Bearer ")[1];

        const decodedToken = await auth.verifyIdToken(token);

        req.user = decodedToken;

        next();
    } catch (error) {
        console.error("Authentication error:", error.message);

        return res.status(401).json({
            message: "Invalid or expired authentication token"
        });
    }
}

export function requireAdmin(req, res, next) {
    if (!req.user?.admin) {
        return res.status(403).json({
            message: "Administrator privileges required"
        });
    }

    next();
}