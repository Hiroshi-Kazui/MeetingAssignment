/**
 * プラットフォーム抽象層。
 * Tauri 上ではネイティブダイアログ＋Rust コマンド（lib.rs）、
 * ブラウザ開発モード（vite dev）では <input type=file> とダウンロードで代替する。
 */
import { invoke } from "@tauri-apps/api/core";
import { open as dialogOpen, save as dialogSave } from "@tauri-apps/plugin-dialog";

export const isTauri: boolean =
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export interface PickedFile {
  name: string;
  path?: string; // Tauri のみ
  data: Uint8Array;
}

/** ファイルを選択して内容を読み込む */
export async function pickAndReadFiles(opts: {
  title: string;
  extensions: string[]; // 例: ["xlsx"]
  multiple?: boolean;
}): Promise<PickedFile[]> {
  if (isTauri) {
    const sel = await dialogOpen({
      title: opts.title,
      multiple: opts.multiple ?? false,
      filters: [{ name: opts.extensions.join("/"), extensions: opts.extensions }],
    });
    if (!sel) return [];
    const paths = Array.isArray(sel) ? sel : [sel];
    const out: PickedFile[] = [];
    for (const p of paths) {
      const bytes = await invoke<number[]>("read_file_bytes", { path: p });
      out.push({
        name: p.replace(/^.*[\\/]/, ""),
        path: p,
        data: new Uint8Array(bytes),
      });
    }
    return out;
  }
  // ブラウザ開発モード
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = opts.extensions.map((e) => `.${e}`).join(",");
    input.multiple = opts.multiple ?? false;
    input.onchange = async () => {
      const files = [...(input.files ?? [])];
      const out: PickedFile[] = [];
      for (const f of files) {
        out.push({ name: f.name, data: new Uint8Array(await f.arrayBuffer()) });
      }
      resolve(out);
    };
    // キャンセル時は空配列（focus 復帰で判定）
    window.addEventListener("focus", () => setTimeout(() => resolve([]), 500), { once: true });
    input.click();
  });
}

/**
 * 保存先を選んで書き出す。戻り値は保存先パス（ブラウザではダウンロードになり null）。
 */
export async function pickAndWriteFile(
  opts: { title: string; suggestedName: string; extensions: string[] },
  data: Uint8Array | string
): Promise<string | null> {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
  if (isTauri) {
    const path = await dialogSave({
      title: opts.title,
      defaultPath: opts.suggestedName,
      filters: [{ name: opts.extensions.join("/"), extensions: opts.extensions }],
    });
    if (!path) return null;
    await invoke("write_file_bytes", { path, data: [...bytes] });
    return path;
  }
  // ブラウザ開発モード: ダウンロード
  const blob = new Blob([bytes.buffer.slice(0) as ArrayBuffer]);
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = opts.suggestedName;
  a.click();
  URL.revokeObjectURL(a.href);
  return null;
}

/** data.json 読み込み（Tauri のみ。ブラウザ開発モードでは常に null） */
export async function loadDataJson(): Promise<string | null> {
  if (!isTauri) return null;
  try {
    return await invoke<string | null>("load_app_data");
  } catch (e) {
    console.warn("data.json の読み込みに失敗", e);
    return null;
  }
}

/** data.json 書き込み（Tauri のみ。ブラウザ開発モードでは何もしない） */
export async function saveDataJson(json: string): Promise<boolean> {
  if (!isTauri) return false;
  try {
    await invoke("save_app_data", { json });
    return true;
  } catch (e) {
    console.warn("data.json の書き込みに失敗", e);
    return false;
  }
}
