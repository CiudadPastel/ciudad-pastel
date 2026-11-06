import { randomUUID } from "node:crypto";
import { db } from "../config/firebase.js";
import { normalizeHomeContent } from "../validators/home-content.validator.js";
import { destroyHomeImage } from "../services/home-image.service.js";

const homeDoc = () => db.collection("site_content").doc("home");
const assets = () => homeDoc().collection("image_assets");
const urls = content => [content.heroImageUrl, content.storeImageUrl, content.about?.imageUrl].filter(Boolean);
const conflict = () => Object.assign(new Error("Home content changed. Reload before saving."), { status: 409 });

export async function getHomeContent() {
    const snapshot = await homeDoc().get();
    const data = snapshot.exists ? snapshot.data() : null;
    return { ...normalizeHomeContent(data), revision: data?.revision || 0 };
}

// The server reserves the ID BEFORE contacting Cloudinary. Even a lost upload
// response can be reclaimed later; clients cannot choose IDs or delete targets.
export async function reserveHomeImage(cloudName) {
    const id = randomUUID();
    const asset = { publicId: `ciudad-pastel/home/${id}`, cloudName,
        resourceType: "image", deliveryType: "upload", state: "pending", createdAt: Date.now() };
    await assets().doc(id).set(asset);
    return { id, ...asset };
}

export async function recordHomeImage(asset, uploaded) {
    await assets().doc(asset.id).update({ url: uploaded.url, assetId: uploaded.assetId });
    return { ...asset, ...uploaded };
}

export async function saveHomeContent(content, revision = 0, uploaded = []) {
    return db.runTransaction(async tx => {
        const [snapshot, registry] = await Promise.all([tx.get(homeDoc()), tx.get(assets())]);
        const current = snapshot.exists ? snapshot.data() : {};
        if ((current.revision || 0) !== revision) throw conflict();
        const records = registry.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        const references = urls(content);
        // Do not let a URL pasted from a resource being removed resurrect it.
        if (records.some(asset => ["deleting", "deleted"].includes(asset.state) && references.includes(asset.url))) throw conflict();
        const imageAssets = {};
        for (const asset of records) {
            if (!references.includes(asset.url)) continue;
            const alreadyPublished = Object.values(current.imageAssets || {}).some(ref => ref.publicId === asset.publicId);
            if (!alreadyPublished && !uploaded.some(ref => ref.id === asset.id)) throw conflict();
            const { publicId, assetId, cloudName, resourceType, deliveryType, url } = asset;
            imageAssets[asset.id] = { publicId, assetId, cloudName, resourceType, deliveryType, url };
            tx.update(assets().doc(asset.id), { state: "active" });
        }
        const saved = { ...content, revision: revision + 1 };
        tx.set(homeDoc(), { ...saved, imageAssets, updatedAt: new Date() });
        return saved;
    });
}

// Durable, retryable cleanup. Pending uploads get a one-hour grace period:
// a timed-out Cloudinary upload may still finish remotely. Run on admin access
// and after publication; never infer ownership from a URL or legacy content.
export async function cleanupHomeImages(now = Date.now()) {
    const registry = await assets().get();
    for (const doc of registry.docs) {
        try {
            const claimed = await db.runTransaction(async tx => {
                const [home, snapshot] = await Promise.all([tx.get(homeDoc()), tx.get(doc.ref)]);
                if (!snapshot.exists) return null;
                const asset = snapshot.data();
                if (urls(home.exists ? home.data() : {}).includes(asset.url)) return null;
                if (asset.state === "pending" && now - asset.createdAt < 3600_000) return null;
                if (asset.state === "deleted") return null;
                tx.update(doc.ref, { state: "deleting" });
                return asset;
            });
            if (!claimed) continue;
            await destroyHomeImage(claimed);
            // Keep a tombstone so a stale pasted URL cannot be republished.
            await doc.ref.update({ state: "deleted" });
        } catch (error) {
            console.error("Home image cleanup will retry:", error.message);
        }
    }
}
