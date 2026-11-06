import { createServer } from "vite";
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Uses an installed Chromium browser and the existing Vite runtime. No new dependencies.
const browser = process.env.UX_TEST_BROWSER || [
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "/usr/bin/chromium", "/usr/bin/google-chrome"
].find(existsSync);
if (!browser) throw new Error("Set UX_TEST_BROWSER to an installed Chromium browser executable.");
const root = fileURLToPath(new URL("../", import.meta.url));
const server = await createServer({ root, server: { host: "127.0.0.1", port: 0 },
    resolve: { alias: [{
        find: /^(?:\.\.\/config\/firebase|\.\.\/src\/config\/firebase)(?:\.js)?$/,
        replacement: path.join(root, "tests/fixtures/firebase.js")
    }] } });
await server.listen();
const port = server.httpServer.address().port;
const profile = mkdtempSync(path.join(tmpdir(), "ciudad-pastel-ux-"));
try {
    for (const size of ["1280,900", "390,844"]) {
      for (const page of ["ux", "cart", "home-integration", "cart-persistence.html?phase=save", "cart-persistence.html?phase=restore"]) {
        const output = await new Promise((resolve, reject) => {
            const child = spawn(browser, ["--headless", "--disable-gpu", "--no-first-run",
                `--user-data-dir=${profile}`, `--window-size=${size}`, "--dump-dom",
                "--virtual-time-budget=20000", `http://127.0.0.1:${port}/tests/${page.includes(".html") ? page : page + ".html"}`], { windowsHide: true });
            let stdout = "";
            let stderr = "";
            const timeout = setTimeout(() => { child.kill(); reject(new Error("Browser tests timed out. " + stderr.slice(-1000))); }, 45000);
            child.stdout.on("data", (chunk) => { stdout += chunk; });
            child.stderr.on("data", (chunk) => { stderr += chunk; });
            child.on("error", reject);
            child.on("close", () => { clearTimeout(timeout); resolve(stdout); });
        });
        const report = output.match(/<pre id="results">([\s\S]*?)<\/pre>/)?.[1];
        console.log(`${page} ${size}\n${report || output.slice(-2000)}`);
        if (!output.includes('data-test-status="passed"')) process.exitCode = 1;
      }
    }
} finally {
    await server.close();
    // Only the exact temporary profile created above is removed.
    if (path.dirname(profile) !== path.resolve(tmpdir()) || !path.basename(profile).startsWith("ciudad-pastel-ux-")) {
        throw new Error("Unexpected browser test profile location.");
    }
    rmSync(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
}
