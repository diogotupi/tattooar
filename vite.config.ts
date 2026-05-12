import basicSsl from "@vitejs/plugin-basic-ssl";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  // Use "/" no dia a dia. Só defina base com subpasta (ex.: "/tattooAR/") ao
  // fazer build para GitHub Pages em site de projeto — senão o dev server
  // exige abrir essa URL e os assets quebram na raiz.
  base: "/",
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
});
