import {
    assertStudentAccessTokenConfiguration,
    verifyStudentAccessToken
} from "../services/student-access-token.service.js";

export function authenticateStudentAccess(req, res, next) {
    res.set("Cache-Control", "private, no-store");
    try {
        assertStudentAccessTokenConfiguration();
        const match = /^Bearer ([^\s]+)$/i.exec(req.get("Authorization") ?? "");
        if (!match) {
            return res.status(401).json({ message: "Invalid or expired student access token." });
        }
        req.studentAccess = verifyStudentAccessToken(match[1]);
        return next();
    } catch (error) {
        if (error.name === "StudentAccessTokenError") {
            return res.status(401).json({ message: "Invalid or expired student access token." });
        }
        return res.status(500).json({ message: "Could not retrieve recipe book." });
    }
}
