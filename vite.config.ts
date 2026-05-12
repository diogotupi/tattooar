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
    plugins: [basicSsl()],
    optimizeDeps: {
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
