/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ADMIN_KEY?: string;
  /** Caminho do JSON exportado (relativo à raiz do site), ex.: `bundles/onca-teste.json`. */
  readonly VITE_PUBLIC_BUNDLE?: string;
}
