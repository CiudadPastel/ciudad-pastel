import { auth } from "../config/firebase.js";

export async function authenticateUser(req, res, next) {
    try {
        const bearer = /^Bearer (\S+)$/.exec(req.headers.authorization ?? "");

        if (!bearer) {
            return res.status(401).json({
                message: "Authentication required"
            });
        }

        const [, token] = bearer;
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
    if (req.user?.admin !== true) {
        return res.status(403).json({
            message: "Administrator privileges required"
        });
    }

    next();
}