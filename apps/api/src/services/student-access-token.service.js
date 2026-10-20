import { createHmac, timingSafeEqual } from "node:crypto";

export const STUDENT_ACCESS_TOKEN_TTL_SECONDS = 900;

export function assertStudentAccessTokenConfiguration(secret = process.env.STUDENT_ACCESS_TOKEN_SECRET) {
    if (typeof secret !== "string" || Buffer.byteLength(secret) < 32) {
        throw new Error("STUDENT_ACCESS_TOKEN_SECRET must contain at least 32 bytes.");
    }
    return secret;
}

function signature(payload, secret) {
    return createHmac("sha256", secret).update(`student-access.v1.${payload}`).digest();
}

function validIds(value) {
    return Array.isArray(value) && value.every((id) => typeof id === "string" && id.length > 0);
}

export function createStudentAccessToken({ enrollmentIds, courseIds }, {
    secret = process.env.STUDENT_ACCESS_TOKEN_SECRET,
    now = Math.floor(Date.now() / 1000)
} = {}) {
    assertStudentAccessTokenConfiguration(secret);
    if (!validIds(enrollmentIds) || !enrollmentIds.length || !validIds(courseIds) || !Number.isSafeInteger(now)) {
        throw new Error("Invalid student access claims.");
    }
    const payload = Buffer.from(JSON.stringify({
        enrollmentIds, courseIds, iat: now, exp: now + STUDENT_ACCESS_TOKEN_TTL_SECONDS
    })).toString("base64url");
    return `${payload}.${signature(payload, secret).toString("base64url")}`;
}

// A valid signature never replaces checking that the enrollment is still active.
export function verifyStudentAccessToken(token, {
    secret = process.env.STUDENT_ACCESS_TOKEN_SECRET,
    now = Math.floor(Date.now() / 1000)
} = {}) {
    assertStudentAccessTokenConfiguration(secret);
    try {
        if (typeof token !== "string") throw new Error();
        const parts = token.split(".");
        if (parts.length !== 2 || parts.some((part) => !/^[A-Za-z0-9_-]+$/.test(part))) throw new Error();
        const [payload, supplied] = parts;
        const actual = Buffer.from(supplied, "base64url");
        const expected = signature(payload, secret);
        if (actual.toString("base64url") !== supplied || actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
            throw new Error();
        }
        const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
        if (!claims || !validIds(claims.enrollmentIds) || !claims.enrollmentIds.length || !validIds(claims.courseIds)
            || !Number.isSafeInteger(now) || !Number.isSafeInteger(claims.iat) || !Number.isSafeInteger(claims.exp)
            || claims.iat > now || claims.exp <= now || claims.exp <= claims.iat
            || claims.exp - claims.iat > STUDENT_ACCESS_TOKEN_TTL_SECONDS) throw new Error();
        return claims;
    } catch {
        const error = new Error("Invalid or expired student access token.");
        error.name = "StudentAccessTokenError";
        throw error;
    }
}
