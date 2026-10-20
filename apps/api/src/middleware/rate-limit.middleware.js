/**
 * Simple in-memory rate limiter by IP address (basic spam protection).
 * It has no external dependencies; counts reset when the server restarts,
 * which is enough for the low number of enrollment requests Ciudad Pastel receives.
 * If the API is deployed behind a proxy, enable app.set("trust proxy", 1)
 * so req.ip is the visitor's real address.
 */
export function createRateLimiter({ windowMs, max, message }) {
    const hits = new Map();

    function rateLimit(req, res, next) {
        const now = Date.now();
        const key = req.ip ?? "unknown";
        const recent = (hits.get(key) ?? []).filter((time) => now - time < windowMs);

        if (recent.length >= max) {
            const retryAfterSeconds = Math.ceil((recent[0] + windowMs - now) / 1000);
            res.set("Retry-After", String(retryAfterSeconds));
            hits.set(key, recent);
            return res.status(429).json({ message });
        }

        recent.push(now);
        hits.set(key, recent);
        next();
    }

    // Used by the tests to start every case with a clean counter.
    rateLimit.reset = () => hits.clear();

    return rateLimit;
}

// At most 5 enrollment requests every 15 minutes per IP.
export const enrollmentRequestRateLimit = createRateLimiter({
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: "Too many enrollment requests. Please try again later."
});

export const studentVerificationRateLimit = createRateLimiter({
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: "Too many verification attempts. Please try again later."
});
