/**
 * Junta os .mind de born-to-be + onca-clipping num único pacote de 2 alvos.
 * Índice 0 = Born to be (vídeo), índice 1 = Onça (clipping stencil).
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { decode, encode } from "@msgpack/msgpack";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

function loadMind(relativePath) {
  const j = JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
  return decode(Buffer.from(j.mindBase64, "base64"));
}

const bornMind = loadMind("public/bundles/born-to-be.json");
const oncaMind = loadMind("public/bundles/onca-clipping.json");

if (bornMind.v !== oncaMind.v) {
  console.warn("Aviso: versões .mind diferentes (born vs onça). A usar v =", bornMind.v);
}

const merged = {
  v: bornMind.v,
  dataList: [...bornMind.dataList, ...oncaMind.dataList],
};

const out = {
  version: 1,
  mindBase64: Buffer.from(encode(merged)).toString("base64"),
  entries: [
    { title: "Arte 1", videoSrc: "videos/borntobe.mp4" },
    { title: "Onça", overlay: "clipping-stencil" },
  ],
};

const outPath = path.join(root, "public/bundles/arte-completo.json");
fs.writeFileSync(outPath, JSON.stringify(out), "utf8");
console.log("OK:", outPath, "alvos:", merged.dataList.length, "bytes:", fs.statSync(outPath).size);
