/** Gera onca-bola.json: mind de onca-alvo.json (ou argv[2] / ONCA_MIND_JSON) + videos/bola.glb. */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

const glbPath = path.join(root, "public/videos/bola.glb");
const outPath = path.join(root, "public/bundles/onca-bola.json");
const defaultMindPath = path.join(root, "public/bundles/onca-alvo.json");

const mindPath =
  process.env.ONCA_MIND_JSON?.trim() ||
  process.argv[2]?.trim() ||
  defaultMindPath;

if (!fs.existsSync(mindPath)) {
  console.error(
    [
      "Falta o JSON com o .mind compilado para a imagem da ONÇA.",
      `Esperado em: ${defaultMindPath}`,
      "Ou passa o caminho: npm run build:onca-bola -- public/bundles/teu-export.json",
      "Ou define ONCA_MIND_JSON.",
      "Obténs esse JSON no bank: imagem alvo = alvo-onça (mesmo ficheiro que usaste no Mind AR), modelo = qualquer, “Compilar e salvar”, depois exportar / copiar para onca-alvo.json.",
    ].join("\n"),
  );
  process.exit(1);
}

if (!fs.existsSync(glbPath)) {
  console.error("Falta:", glbPath);
  process.exit(1);
}

const mindJson = JSON.parse(fs.readFileSync(mindPath, "utf8"));
if (!mindJson.mindBase64 || typeof mindJson.mindBase64 !== "string") {
  console.error("JSON inválido: falta mindBase64.", mindPath);
  process.exit(1);
}

const glbBuf = fs.readFileSync(glbPath);
const glbBase64 = glbBuf.toString("base64");

const out = {
  version: 1,
  mindBase64: mindJson.mindBase64,
  entries: [{ title: "Bola (GLB)", glbBase64 }],
};

fs.writeFileSync(outPath, JSON.stringify(out), "utf8");
console.log("OK:", outPath);
console.log("  mind de:", path.relative(root, mindPath));
console.log("  tamanho:", fs.statSync(outPath).size, "bytes | GLB:", glbBuf.length, "bytes");
