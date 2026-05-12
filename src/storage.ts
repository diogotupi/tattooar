export type ArEntryMeta = {
  title: string;
};

export type ArBundle = {
  version: 1;
  mind: ArrayBuffer;
  entries: Array<ArEntryMeta & { glb: ArrayBuffer }>;
};

const DB_NAME = "capaz-tattoo-ar";
const DB_VERSION = 1;
const STORE = "kv";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };
  });
}

export async function loadBundle(): Promise<ArBundle | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const store = tx.objectStore(STORE);
    const get = store.get("bundle");
    get.onsuccess = () => {
      const v = get.result as ArBundle | undefined;
      resolve(v ?? null);
    };
    get.onerror = () => reject(get.error);
  });
}

export async function saveBundle(bundle: ArBundle): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    store.put(bundle, "bundle");
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function clearBundle(): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    store.delete("bundle");
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function base64ToArrayBuffer(b64: string): ArrayBuffer {
  const binary = atob(b64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

export type ExportPayload = {
  version: 1;
  mindBase64: string;
  entries: Array<{ title: string; glbBase64: string }>;
};

export function bundleToExportPayload(bundle: ArBundle): ExportPayload {
  return {
    version: 1,
    mindBase64: arrayBufferToBase64(bundle.mind),
    entries: bundle.entries.map((e) => ({
      title: e.title,
      glbBase64: arrayBufferToBase64(e.glb),
    })),
  };
}

export function importPayloadToBundle(data: ExportPayload): ArBundle {
  if (data.version !== 1) {
    throw new Error("Versão de arquivo não suportada.");
  }
  return {
    version: 1,
    mind: base64ToArrayBuffer(data.mindBase64),
    entries: data.entries.map((e) => ({
      title: e.title,
      glb: base64ToArrayBuffer(e.glbBase64),
    })),
  };
}

export function toArrayBuffer(data: ArrayBuffer | Uint8Array): ArrayBuffer {
  if (data instanceof ArrayBuffer) {
    return data;
  }
  return new Uint8Array(data).buffer;
}
