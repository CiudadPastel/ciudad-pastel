import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

const verifyIdToken = vi.hoisted(() => vi.fn());

vi.mock("dotenv", () => ({ default: { config: vi.fn() } }));
vi.mock("../src/config/firebase.js", () => ({ auth: { verifyIdToken }, db: {} }));

import app from "../src/app.js";

const adminHealth = "/api/admin/health";
const admin = { uid: "admin-1", email: "admin@example.com", admin: true, internalClaim: "private" };

beforeEach(() => {
    verifyIdToken.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe("Administrative authentication (CIU-17)", () => {
    it("grants access only with the boolean admin claim and returns the session fields", async () => {
        verifyIdToken.mockResolvedValue(admin);
        const response = await request(app).get(adminHealth).set("Authorization", "Bearer admin-token");
        expect(response.status).toBe(200);
        expect(response.body.user).toEqual({ uid: admin.uid, email: admin.email });
        expect(verifyIdToken).toHaveBeenCalledExactlyOnceWith("admin-token");
    });

    it("requires a token", async () => {
        const response = await request(app).get(adminHealth);
        expect(response.status).toBe(401);
        expect(verifyIdToken).not.toHaveBeenCalled();
    });

    it.each(["invalid", "expired"])("returns a generic 401 for an %s Firebase token", async (reason) => {
        verifyIdToken.mockRejectedValue(Object.assign(new Error(`Firebase token ${reason}`), {
            code: reason === "expired" ? "auth/id-token-expired" : "auth/argument-error"
        }));
        const response = await request(app).get(adminHealth).set("Authorization", "Bearer rejected-token");
        expect(response.status).toBe(401);
        expect(response.body).toEqual({ message: "Invalid or expired authentication token" });
    });

    it.each([undefined, false, "false", "true", 1])("rejects authenticated users with admin claim %j", async (claim) => {
        verifyIdToken.mockResolvedValue({ uid: "user-1", admin: claim });
        const response = await request(app).get(adminHealth).set("Authorization", "Bearer user-token");
        expect(response.status).toBe(403);
        expect(response.body).toEqual({ message: "Administrator privileges required" });
    });

    it("rejects a malformed Bearer header even if it contains a valid token prefix", async () => {
        verifyIdToken.mockImplementation(async (token) => {
            if (token === "admin-token") return admin;
            throw new Error("Invalid Firebase token");
        });
        const response = await request(app).get(adminHealth)
            .set("Authorization", "Bearer admin-tokenBearer ignored");
        expect(response.status).toBe(401);
        expect(verifyIdToken).not.toHaveBeenCalled();
    });
});
