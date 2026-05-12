import "./styles/home.css";
import { loadBundle } from "./storage";
import { startArSession } from "./ar-session";

const openAr = document.querySelector<HTMLButtonElement>("#openAr");
const closeAr = document.querySelector<HTMLButtonElement>("#closeAr");
const arLayer = document.querySelector<HTMLDivElement>("#arLayer");
const arContainer = document.querySelector<HTMLDivElement>("#arContainer");
const homeStatus = document.querySelector<HTMLParagraphElement>("#homeStatus");
const scanHint = document.querySelector<HTMLParagraphElement>("#scanHint");

if (!openAr || !closeAr || !arLayer || !arContainer || !homeStatus || !scanHint) {
  throw new Error("Markup principal incompleto.");
}

let session: { stop: () => void } | null = null;

async function refreshHomeMessage(): Promise<void> {
  const bundle = await loadBundle();
  if (!bundle || bundle.entries.length === 0) {
    homeStatus.textContent =
      "Ainda não há artes salvas. Acesse o Banco no rodapé, adicione imagens + GLB e compile.";
  } else {
    homeStatus.textContent = `${bundle.entries.length} arte(s) pronta(s). Toque na câmera para testar.`;
  }
}

void refreshHomeMessage();

openAr.addEventListener("click", async () => {
  const bundle = await loadBundle();
  if (!bundle || bundle.entries.length === 0) {
    homeStatus.textContent = "Sem dados AR. Configure primeiro no Banco de artes.";
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
  arContainer.innerHTML = "";
  arLayer.hidden = true;
  document.body.classList.remove("ar-open");
  void refreshHomeMessage();
}

closeAr.addEventListener("click", () => {
  closeSession();
});
