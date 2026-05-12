import basicSsl from "@vitejs/plugin-basic-ssl";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv } from "vite";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, rootDir, "VITE_");
  let base = (env.VITE_BASE_PATH ?? "/").trim();
  if (!base.startsWith("/")) {
    base = `/${base}`;
  }
  if (base !== "/" && !base.endsWith("/")) {
    base = `${base}/`;
  }

  return {
    base,
    /** TensorFlow.js (Mind AR compiler) espera `global` no browser em alguns bundles. */
    define: {
      global: "globalThis",
    },
    plugins: [basicSsl()],
    optimizeDeps: {
      /**
       * Não pré-empacotar mind-ar: o compilador usa `compiler.worker.js?worker&inline`
       * e o esbuild não expõe default export compatível com o import do Mind AR.
       * O `src/mind-ar-compiler.ts` garante mesma origem / resolução correcta em dev.
       */
      exclude: ["mind-ar"],
    },
    worker: {
      format: "es",
    },
    build: {
      rollupOptions: {
        input: {
          main: path.resolve(rootDir, "index.html"),
          bank: path.resolve(rootDir, "bank.html"),
        },
      },
    },
  };
});
