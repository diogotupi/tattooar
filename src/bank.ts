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
  /** GLB ou MP4 (vídeo em plano no AR). */
  model: File | null;
};

const rowsHost = document.querySelector<HTMLDivElement>("#rows");
const addRowBtn = document.querySelector<HTMLButtonElement>("#addRow");
const compileBtn = document.querySelector<HTMLButtonElement>("#compileSave");
const clearBtn = document.querySelector<HTMLButtonElement>("#clearAll");
const progressEl = document.querySelector<HTMLParagraphElement>("#compileProgress");
const exportBtn = document.querySelector<HTMLButtonElement>("#exportBundle");
const importInput = document.querySelector<HTMLInputElement>("#importBundle");
const bankApp = document.querySelector<HTMLDivElement>("#bankApp");
const adminGate = document.querySelector<HTMLDivElement>("#adminGate");
const adminGateForm = document.querySelector<HTMLFormElement>("#adminGateForm");
const adminKeyInput = document.querySelector<HTMLInputElement>("#adminKeyInput");
const adminGateErr = document.querySelector<HTMLParagraphElement>("#adminGateErr");

const ADMIN_KEY = (import.meta.env.VITE_ADMIN_KEY as string | undefined)?.trim();

if (
  !rowsHost ||
  !addRowBtn ||
  !compileBtn ||
  !clearBtn ||
  !progressEl ||
  !exportBtn ||
  !importInput ||
  !bankApp ||
  !adminGate ||
  !adminGateForm ||
  !adminKeyInput ||
  !adminGateErr
) {
  throw new Error("Markup do banco incompleto.");
}

const BANK_AUTH_STORAGE = "capaz_bank_auth";

function isBankAuthOk(): boolean {
  if (!ADMIN_KEY) return true;
  try {
    return sessionStorage.getItem(BANK_AUTH_STORAGE) === ADMIN_KEY;
  } catch {
    return false;
  }
}

function tryUnlockFromQuery(): boolean {
  if (!ADMIN_KEY) return true;
  const q = new URLSearchParams(location.search).get("admin");
  if (q?.trim() === ADMIN_KEY) {
    try {
      sessionStorage.setItem(BANK_AUTH_STORAGE, ADMIN_KEY);
    } catch {
      /* modo privado / bloqueio */
    }
    history.replaceState(null, "", `${location.pathname}${location.hash}`);
    return true;
  }
  return false;
}

function setBankUiUnlocked(): void {
  bankApp!.hidden = false;
  adminGate!.hidden = true;
}

function setBankUiLocked(): void {
  bankApp!.hidden = true;
  adminGate!.hidden = false;
}

function startAdminGate(): void {
  setBankUiLocked();
  adminGateErr!.textContent = "";
  adminGateForm!.addEventListener("submit", (e) => {
    e.preventDefault();
    adminGateErr!.textContent = "";
    if (!ADMIN_KEY) return;
    if (adminKeyInput!.value.trim() === ADMIN_KEY) {
      try {
        sessionStorage.setItem(BANK_AUTH_STORAGE, ADMIN_KEY);
      } catch {
        /* ignore */
      }
      adminKeyInput!.value = "";
      setBankUiUnlocked();
      void bootstrap();
    } else {
      adminGateErr!.textContent = "Chave incorreta.";
    }
  });
}

function enterBank(): void {
  if (!ADMIN_KEY) {
    setBankUiUnlocked();
    void bootstrap();
    return;
  }
  if (tryUnlockFromQuery() || isBankAuthOk()) {
    setBankUiUnlocked();
    void bootstrap();
    return;
  }
  startAdminGate();
}

const rows: Row[] = [];

function isVideoModelFile(f: File): boolean {
  if (f.type === "video/mp4") return true;
  return f.name.toLowerCase().endsWith(".mp4");
}

/** O detector Mind AR + TF.js em WebGL rebenta com fotos gigantes; limitamos o lado maior. */
const MAX_TARGET_COMPILE_SIDE = 1024;

function decodeImageFromUrl(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Não foi possível ler a imagem alvo."));
    img.src = src;
  });
}

/**
 * Carrega a imagem alvo e reduz o lado maior a no máximo `maxSide` px antes do Mind AR compilar
 * (evita falhas WebGL / limites de textura no TensorFlow.js).
 */
async function loadTargetImageForCompiler(file: File, maxSide: number): Promise<HTMLImageElement> {
  const blobUrl = URL.createObjectURL(file);
  try {
    const srcImg = await decodeImageFromUrl(blobUrl);
    const w0 = srcImg.naturalWidth;
    const h0 = srcImg.naturalHeight;
    if (w0 <= 0 || h0 <= 0) {
      throw new Error("Imagem alvo com dimensões inválidas.");
    }
    const scale = Math.min(1, maxSide / Math.max(w0, h0));
    const w = Math.max(1, Math.round(w0 * scale));
    const h = Math.max(1, Math.round(h0 * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Canvas 2D não disponível neste browser.");
    }
    ctx.drawImage(srcImg, 0, 0, w, h);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
    return decodeImageFromUrl(dataUrl);
  } finally {
    URL.revokeObjectURL(blobUrl);
  }
}

function compileErrorMessage(e: unknown): string {
  if (e instanceof Error && e.message) return e.message;
  return String(e);
}

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
        <span>Animação (GLB ou MP4)</span>
        <input type="file" class="row-model" accept=".glb,model/gltf-binary,video/mp4,.mp4" />
      </label>
      <button type="button" class="btn danger row-remove">Remover</button>
    `;

    const titleInput = wrap.querySelector<HTMLInputElement>(".row-title");
    const imgInput = wrap.querySelector<HTMLInputElement>(".row-img");
    const modelInput = wrap.querySelector<HTMLInputElement>(".row-model");
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
    modelInput?.addEventListener("change", () => {
      row.model = modelInput.files?.[0] ?? null;
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
    model: partial?.model ?? null,
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
    if (!r.image || !r.model) {
      progressEl.textContent = "Cada linha precisa de imagem alvo e animação (GLB ou MP4).";
      return;
    }
  }

  compileBtn.disabled = true;
  progressEl.textContent = "Carregando biblioteca de compilação…";

  try {
    const { Compiler } = await import("./mind-ar-compiler");

    const images: HTMLImageElement[] = [];
    progressEl.textContent = `A preparar imagens (máx. ${MAX_TARGET_COMPILE_SIDE}px de lado)…`;
    for (const r of rows) {
      images.push(await loadTargetImageForCompiler(r.image!, MAX_TARGET_COMPILE_SIDE));
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
      if (isVideoModelFile(r.model!)) {
        entries.push({
          title: r.title,
          glb: new ArrayBuffer(0),
          videoSrc: `videos/${r.model!.name}`,
        });
      } else {
        const glbBuf = await r.model!.arrayBuffer();
        entries.push({ title: r.title, glb: glbBuf });
      }
    }

    const bundle: ArBundle = {
      version: 1,
      mind: mindBuffer,
      entries,
    };

    await saveBundle(bundle);
    progressEl.textContent = "Salvo com sucesso. Volte ao início e abra a câmera.";
  } catch (e) {
    console.error(e);
    const detail = compileErrorMessage(e);
    progressEl.textContent = `Erro na compilação: ${detail}. Abre a consola (F12) para o stack completo. Dicas: imagem com bom contraste; tenta Chrome ou Edge; desliga extensões que bloqueiam WebGL.`;
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
    progressEl!.textContent = `Neste aparelho já existe um pacote com: ${names}. Para recompilar, escolha de novo imagem + GLB/MP4 na mesma ordem das linhas.`;
  } else {
    progressEl!.textContent =
      "Adiciona imagem alvo + GLB ou MP4 por linha (MP4: ficheiro tem de existir em public/videos/ com o mesmo nome no deploy), depois “Compilar e salvar”.";
  }
}

enterBank();
