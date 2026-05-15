/**
 * Compila arte-completo.json via compile-bundles.html (Playwright + servidor Vite).
 * Requer: npm install && npx playwright install chromium
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import https from "node:https";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const outFile = path.join(root, "public/bundles/arte-completo.json");
const downloadDir = path.join(root, ".tmp-arte-completo-dl");

const DEV_PORT = process.env.COMPILE_PORT || "5210";
const DEV_ORIGIN = `https://localhost:${DEV_PORT}`;

function waitForServer(timeoutMs = 120_000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      https
        .get(`${DEV_ORIGIN}/compile-bundles.html`, { rejectUnauthorized: false }, (res) => {
          res.resume();
          if (res.statusCode && res.statusCode < 500) resolve();
          else if (Date.now() - start > timeoutMs) reject(new Error("Servidor não respondeu."));
          else setTimeout(tick, 500);
        })
        .on("error", () => {
          if (Date.now() - start > timeoutMs) reject(new Error("Timeout à espera do Vite."));
          else setTimeout(tick, 500);
        });
    };
    tick();
  });
}

async function main() {
  fs.mkdirSync(downloadDir, { recursive: true });

  const vite = spawn(
    process.platform === "win32" ? "npx.cmd" : "npx",
    ["vite", "--port", DEV_PORT, "--strictPort"],
    { cwd: root, stdio: "inherit", shell: true },
  );

  try {
    await waitForServer();

    const { chromium } = await import("playwright");
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ ignoreHTTPSErrors: true });
    const page = await context.newPage();

    const downloadPromise = page.waitForEvent("download", { timeout: 600_000 });
    await page.goto(`${DEV_ORIGIN}/compile-bundles.html`, { waitUntil: "networkidle" });
    await page.click("#run");
    log("Compilando no browser (1–5 min)…");

    const download = await downloadPromise;
    const dest = path.join(downloadDir, "arte-completo.json");
    await download.saveAs(dest);
    await browser.close();

    fs.copyFileSync(dest, outFile);
    console.log("OK:", outFile, "bytes", fs.statSync(outFile).size);
  } finally {
    vite.kill("SIGTERM");
  }
}

function log(msg) {
  console.log(msg);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
