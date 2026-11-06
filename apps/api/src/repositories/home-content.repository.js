import { db } from "../config/firebase.js";
import { normalizeHomeContent } from "../validators/home-content.validator.js";

const homeDoc = () => db.collection("site_content").doc("home");

export async function getHomeContent() {
    const snapshot = await homeDoc().get();
    return normalizeHomeContent(snapshot.exists ? snapshot.data() : null);
}

export async function saveHomeContent(content) {
    await homeDoc().set({ ...content, updatedAt: new Date() });
    return content;
}
