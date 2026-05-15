import "./styles/home.css";
import logoUrl from "../assets/logo.png";
import {
  importPayloadToBundle,
  loadBundle,
  saveBundle,
  type ExportPayload,
} from "./storage";
import { startArSession } from "./ar-session";

function publicBundleRelativePath(): string {
  const raw = (import.meta.env.VITE_PUBLIC_BUNDLE as string | undefined)?.trim();
  if (raw) return raw.replace(/^\/+/, "");
  /** Ficheiro em `public/bundles/` — copiado tal qual para a raiz do deploy. */
  return "bundles/born-to-be.json";
}

const PUBLIC_BUNDLE_URL = `${import.meta.env.BASE_URL.replace(/\/?$/, "/")}${publicBundleRelativePath()}`;

function isExportPayload(v: unknown): v is ExportPayload {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  if (o.version !== 1) return false;
  if (typeof o.mindBase64 !== "string") return false;
  if (!Array.isArray(o.entries)) return false;
  for (const e of o.entries) {
    if (!e || typeof e !== "object") return false;
    const row = e as Record<string, unknown>;
    if (typeof row.title !== "string") return false;
    const glb = row.glbBase64;
    const vid = row.videoSrc;
    const overlay = row.overlay;
    const hasGlb = typeof glb === "string" && glb.length > 0;
    const hasVid = typeof vid === "string" && vid.length > 0;
    const hasOverlay = overlay === "clipping-stencil";
    if (!hasGlb && !hasVid && !hasOverlay) return false;
    if (overlay !== undefined && overlay !== "clipping-stencil") return false;
    const ta = row.targetAspect;
    if (ta !== undefined && (typeof ta !== "number" || !Number.isFinite(ta) || ta <= 0)) {
      return false;
    }
  }
  return true;
}

async function trySyncPublicBundle(): Promise<void> {
  try {
    const res = await fetch(PUBLIC_BUNDLE_URL, { cache: "no-cache" });
    if (!res.ok) return;
    const data: unknown = await res.json();
    if (!isExportPayload(data)) {
      console.warn(`[AR] Pacote público inválido (${publicBundleRelativePath()}).`);
      return;
    }
    const bundle = importPayloadToBundle(data);
    await saveBundle(bundle);
  } catch (e) {
    console.warn(`[AR] Não foi possível carregar o pacote público (${PUBLIC_BUNDLE_URL}).`, e);
  }
}

const openAr = document.querySelector<HTMLButtonElement>("#openAr");
const closeAr = document.querySelector<HTMLButtonElement>("#closeAr");
const arLayer = document.querySelector<HTMLDivElement>("#arLayer");
const arContainer = document.querySelector<HTMLDivElement>("#arContainer");
const scanHint = document.querySelector<HTMLParagraphElement>("#scanHint");
const brandLogo = document.querySelector<HTMLImageElement>(".brand__logo");

if (!openAr || !closeAr || !arLayer || !arContainer || !scanHint || !brandLogo) {
  throw new Error("Markup principal incompleto.");
}

brandLogo.src = logoUrl;

let session: { stop: () => void } | null = null;

void trySyncPublicBundle();

openAr.addEventListener("click", async () => {
  const bundle = await loadBundle();
  if (!bundle || bundle.entries.length === 0) {
    return;
  }

  arLayer.hidden = false;
  document.body.classList.add("ar-open");
  scanHint.textContent = "Procurando arte…";
  arContainer.innerHTML = "";

  try {
    session = await startArSession(arContainer, bundle, (t) => {
      scanHint.textContent = t;
    });
  } catch (e) {
    console.error(e);
    scanHint.textContent = "Não foi possível iniciar a câmara ou o AR.";
    arContainer.innerHTML = "";
    arLayer.hidden = true;
    document.body.classList.remove("ar-open");
  }
});

function closeSession(): void {
  session?.stop();
  session = null;
  arContainer!.innerHTML = "";
  arLayer!.hidden = true;
  document.body.classList.remove("ar-open");
}

closeAr.addEventListener("click", () => {
  closeSession();
});
