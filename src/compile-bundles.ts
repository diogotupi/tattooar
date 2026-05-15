import { Compiler } from "./mind-ar-compiler";
import { bundleToExportPayload, type ArBundle } from "./storage";

const MAX_SIDE = 1024;
const logEl = document.querySelector<HTMLParagraphElement>("#log");
const runBtn = document.querySelector<HTMLButtonElement>("#run");

function log(msg: string): void {
  if (logEl) logEl.textContent = msg;
  console.log(msg);
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Imagem inválida: ${url}`));
    img.src = url;
  });
}

async function resizeForCompiler(src: HTMLImageElement, maxSide: number): Promise<HTMLImageElement> {
  const w0 = src.naturalWidth;
  const h0 = src.naturalHeight;
  const scale = Math.min(1, maxSide / Math.max(w0, h0));
  const w = Math.max(1, Math.round(w0 * scale));
  const h = Math.max(1, Math.round(h0 * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D indisponível.");
  ctx.drawImage(src, 0, 0, w, h);
  return loadImage(canvas.toDataURL("image/jpeg", 0.92));
}

function toArrayBuffer(data: ArrayBuffer | Uint8Array): ArrayBuffer {
  if (data instanceof ArrayBuffer) return data;
  return new Uint8Array(data).buffer;
}

async function compileAndDownload(): Promise<void> {
  if (!runBtn) return;
  runBtn.disabled = true;

  try {
    const base = import.meta.env.BASE_URL.replace(/\/?$/, "/");
    log("A carregar alvos (Born to be + Onça)…");
    const born = await resizeForCompiler(await loadImage(`${base}alvos/borntobe.png`), MAX_SIDE);
    const onca = await resizeForCompiler(await loadImage(`${base}alvos/alvo-onca.jpg`), MAX_SIDE);

    log("A compilar .mind (pode demorar alguns minutos)…");
    const compiler = new Compiler();
    await compiler.compileImageTargets([born, onca], (p) => {
      log(`A compilar… ${p.toFixed(1)}%`);
    });

    const mind = toArrayBuffer(compiler.exportData() as ArrayBuffer | Uint8Array);

    const bundle: ArBundle = {
      version: 1,
      mind,
      entries: [
        { title: "Arte 1", glb: new ArrayBuffer(0), videoSrc: "videos/borntobe.mp4" },
        { title: "Onça", glb: new ArrayBuffer(0), overlay: "clipping-stencil" },
      ],
    };

    const json = JSON.stringify(bundleToExportPayload(bundle));
    const blob = new Blob([json], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "arte-completo.json";
    a.click();
    URL.revokeObjectURL(a.href);

    log("Concluído. Copia arte-completo.json para public/bundles/ e define VITE_PUBLIC_BUNDLE=bundles/arte-completo.json");
  } catch (e) {
    console.error(e);
    log(`Erro: ${e instanceof Error ? e.message : String(e)}`);
  } finally {
    runBtn.disabled = false;
  }
}

runBtn?.addEventListener("click", () => {
  void compileAndDownload();
});
