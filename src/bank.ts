import "./styles/bank.css";
import type { ArBundle } from "./storage";
import {
  bundleToExportPayload,
  clearBundle,
  importPayloadToBundle,
  loadBundle,
  saveBundle,
  toArrayBuffer,
  type ExportPayload,
} from "./storage";

type Row = {
  id: string;
  title: string;
  image: File | null;
  glb: File | null;
};

const rowsHost = document.querySelector<HTMLDivElement>("#rows");
const addRowBtn = document.querySelector<HTMLButtonElement>("#addRow");
const compileBtn = document.querySelector<HTMLButtonElement>("#compileSave");
const clearBtn = document.querySelector<HTMLButtonElement>("#clearAll");
const progressEl = document.querySelector<HTMLParagraphElement>("#compileProgress");
const exportBtn = document.querySelector<HTMLButtonElement>("#exportBundle");
const importInput = document.querySelector<HTMLInputElement>("#importBundle");

if (!rowsHost || !addRowBtn || !compileBtn || !clearBtn || !progressEl || !exportBtn || !importInput) {
  throw new Error("Markup do banco incompleto.");
}

const rows: Row[] = [];

function uid(): string {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function renderRows(): void {
  rowsHost!.innerHTML = "";
  for (const row of rows) {
    const wrap = document.createElement("div");
    wrap.className = "row";
    wrap.dataset.id = row.id;

    wrap.innerHTML = `
      <label class="field">
        <span>Nome</span>
        <input type="text" class="row-title" />
      </label>
      <label class="field">
        <span>Imagem alvo (PNG/JPG)</span>
        <input type="file" class="row-img" accept="image/png,image/jpeg,image/webp" />
      </label>
      <label class="field">
        <span>Animação (GLB)</span>
        <input type="file" class="row-glb" accept=".glb,model/gltf-binary" />
      </label>
      <button type="button" class="btn danger row-remove">Remover</button>
    `;

    const titleInput = wrap.querySelector<HTMLInputElement>(".row-title");
    const imgInput = wrap.querySelector<HTMLInputElement>(".row-img");
    const glbInput = wrap.querySelector<HTMLInputElement>(".row-glb");
    const removeBtn = wrap.querySelector<HTMLButtonElement>(".row-remove");

    if (titleInput) {
      titleInput.value = row.title;
    }

    titleInput?.addEventListener("input", () => {
      row.title = titleInput.value.trim() || "Sem nome";
    });
    imgInput?.addEventListener("change", () => {
      row.image = imgInput.files?.[0] ?? null;
    });
    glbInput?.addEventListener("change", () => {
      row.glb = glbInput.files?.[0] ?? null;
    });
    removeBtn?.addEventListener("click", () => {
      const idx = rows.findIndex((r) => r.id === row.id);
      if (idx >= 0) rows.splice(idx, 1);
      renderRows();
    });

    rowsHost!.appendChild(wrap);
  }
}

function addRow(partial?: Partial<Row>): void {
  rows.push({
    id: uid(),
    title: partial?.title ?? `Arte ${rows.length + 1}`,
    image: partial?.image ?? null,
    glb: partial?.glb ?? null,
  });
  renderRows();
}

addRowBtn.addEventListener("click", () => addRow());

clearBtn.addEventListener("click", async () => {
  if (!confirm("Apagar todas as artes guardadas neste dispositivo?")) return;
  await clearBundle();
  rows.length = 0;
  addRow();
  progressEl.textContent = "Base limpa.";
});

compileBtn.addEventListener("click", async () => {
  progressEl.textContent = "";
  if (rows.length === 0) {
    progressEl.textContent = "Adiciona pelo menos uma linha.";
    return;
  }
  for (const r of rows) {
    if (!r.image || !r.glb) {
      progressEl.textContent = "Cada linha precisa de imagem alvo e GLB.";
      return;
    }
  }

  compileBtn.disabled = true;
  progressEl.textContent = "Carregando biblioteca de compilação…";

  try {
    const { Compiler } = await import("mind-ar/src/image-target/compiler.js");

    const images: HTMLImageElement[] = [];
    const objectUrls: string[] = [];
    try {
      for (const r of rows) {
        const url = URL.createObjectURL(r.image!);
        objectUrls.push(url);
        const img = new Image();
        img.decoding = "async";
        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve();
          img.onerror = () => reject(new Error("Imagem inválida."));
          img.src = url;
        });
        images.push(img);
      }

      const compiler = new Compiler();
      progressEl.textContent = "Compilando (pode levar vários minutos)…";

      await compiler.compileImageTargets(images, (p: number) => {
        progressEl.textContent = `Compilando… ${p.toFixed(1)}%`;
      });

      const exported = compiler.exportData() as ArrayBuffer | Uint8Array;
      const mindBuffer =
        exported instanceof ArrayBuffer ? exported : toArrayBuffer(exported);

      const entries: ArBundle["entries"] = [];
      for (const r of rows) {
        const glbBuf = await r.glb!.arrayBuffer();
        entries.push({ title: r.title, glb: glbBuf });
      }

      const bundle: ArBundle = {
        version: 1,
        mind: mindBuffer,
        entries,
      };

      await saveBundle(bundle);
      progressEl.textContent = "Salvo com sucesso. Volte ao início e abra a câmera.";
    } finally {
      for (const u of objectUrls) {
        URL.revokeObjectURL(u);
      }
    }
  } catch (e) {
    console.error(e);
    progressEl.textContent =
      "Erro na compilação. Tenta imagens mais pequenas/contrastadas ou outro browser.";
  } finally {
    compileBtn.disabled = false;
  }
});

exportBtn.addEventListener("click", async () => {
  const bundle = await loadBundle();
  if (!bundle) {
    progressEl.textContent = "Nada para exportar.";
    return;
  }
  const payload = bundleToExportPayload(bundle);
  const json = JSON.stringify(payload);
  const blob = new Blob([json], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "capaz-ar-bundle.json";
  a.click();
  URL.revokeObjectURL(a.href);
  progressEl.textContent = "Arquivo JSON baixado (pode ficar grande).";
});

importInput.addEventListener("change", async () => {
  const file = importInput.files?.[0];
  importInput.value = "";
  if (!file) return;
  try {
    const text = await file.text();
    const data = JSON.parse(text) as ExportPayload;
    const bundle = importPayloadToBundle(data);
    await saveBundle(bundle);
    progressEl.textContent = "Importado e guardado.";
  } catch (e) {
    console.error(e);
    progressEl.textContent = "Arquivo inválido.";
  }
});

async function bootstrap(): Promise<void> {
  const existing = await loadBundle();
  rows.length = 0;
  addRow();
  if (existing && existing.entries.length > 0) {
    const names = existing.entries.map((e) => e.title).join(", ");
    progressEl!.textContent = `Neste aparelho já existe um pacote com: ${names}. Para recompilar, escolha de novo imagem + GLB na mesma ordem das linhas.`;
  } else {
    progressEl!.textContent = "Adiciona imagens alvo + GLB por linha, depois “Compilar e salvar”.";
  }
}

void bootstrap();
