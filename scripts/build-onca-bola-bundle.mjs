/** Gera `public/bundles/onca-bola.json` (mind = born-to-be, GLB = videos/bola.glb). */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

const bornPath = path.join(root, "public/bundles/born-to-be.json");
const glbPath = path.join(root, "public/videos/bola.glb");
const outPath = path.join(root, "public/bundles/onca-bola.json");

const born = JSON.parse(fs.readFileSync(bornPath, "utf8"));
if (!born.mindBase64 || typeof born.mindBase64 !== "string") {
  throw new Error("born-to-be.json inválido: falta mindBase64.");
}

const glbBuf = fs.readFileSync(glbPath);
const glbBase64 = glbBuf.toString("base64");

const out = {
  version: 1,
  mindBase64: born.mindBase64,
  entries: [{ title: "Bola (GLB)", glbBase64 }],
};

fs.writeFileSync(outPath, JSON.stringify(out), "utf8");
console.log("OK:", outPath, "tamanho", fs.statSync(outPath).size, "bytes; GLB", glbBuf.length, "bytes");
