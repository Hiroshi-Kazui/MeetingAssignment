/**
 * IndexedDB ラッパ（要件定義 §3: IndexedDB + data.json 二重書き込みの片翼）
 * 単一 store "app" の key "data" に AppData 全体を保存するシンプルな構成。
 */
import type { AppData } from "./models";

const DB_NAME = "meeting-assign";
const STORE = "app";
const KEY = "data";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function idbLoad(): Promise<AppData | null> {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(KEY);
      req.onsuccess = () => resolve((req.result as AppData) ?? null);
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    console.warn("IndexedDB 読み込み失敗（data.json から復旧を試みます）", e);
    return null;
  }
}

export async function idbSave(data: AppData): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(data, KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
