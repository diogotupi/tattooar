/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ADMIN_KEY?: string;
  /** Caminho do JSON exportado (relativo à raiz do site), ex.: `bundles/born-to-be.json`. */
  readonly VITE_PUBLIC_BUNDLE?: string;
}
