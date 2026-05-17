/** Gera `public/bundles/onca-clipping.json` (mind da onça + overlay clipping-stencil). */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const outPath = path.join(root, "public/bundles/onca-clipping.json");
const mindCache = path.join(root, "public/bundles/.onca-mind-cache.json");

function loadOnçaMindBase64() {
  if (fs.existsSync(mindCache)) {
    const cached = JSON.parse(fs.readFileSync(mindCache, "utf8"));
    if (cached.mindBase64) return cached.mindBase64;
  }

  const commits = ["HEAD", "3e7c423", "b2b4b7a"];
  for (const ref of commits) {
    try {
      const raw = execSync(`git show ${ref}:public/bundles/onca-teste.json`, {
        cwd: root,
        maxBuffer: 50 * 1024 * 1024,
        stdio: ["pipe", "pipe", "ignore"],
      });
      const data = JSON.parse(raw.toString("utf8"));
      if (data.mindBase64) {
        fs.writeFileSync(mindCache, JSON.stringify({ mindBase64: data.mindBase64 }), "utf8");
        return data.mindBase64;
      }
    } catch {
      /* try next ref */
    }
  }

  throw new Error(
    "Não encontrei .mind da onça no Git (onca-teste.json). Compila no bank com public/alvos/alvo-onca.jpg e exporta; depois ONCA_MIND_JSON=caminho npm run build:onca-clipping",
  );
}

const mindBase64 = process.env.ONCA_MIND_JSON
  ? JSON.parse(fs.readFileSync(process.env.ONCA_MIND_JSON.trim(), "utf8")).mindBase64
  : loadOnçaMindBase64();

if (!mindBase64) {
  throw new Error("mindBase64 em falta.");
}

const out = {
  version: 1,
  mindBase64,
  entries: [{ title: "Onça", overlay: "demo-3d" }],
};

fs.writeFileSync(outPath, JSON.stringify(out), "utf8");
console.log("OK:", outPath, "bytes", fs.statSync(outPath).size);
