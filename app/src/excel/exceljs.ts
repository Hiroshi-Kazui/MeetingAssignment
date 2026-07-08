import type ExcelJS from "exceljs";

declare global {
  interface Window {
    ExcelJS?: typeof ExcelJS;
  }
}

let excelJsPromise: Promise<typeof ExcelJS> | null = null;

export function loadExcelJS(): Promise<typeof ExcelJS> {
  if (window.ExcelJS) return Promise.resolve(window.ExcelJS);
  if (excelJsPromise) return excelJsPromise;

  excelJsPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-lib="exceljs"]');
    if (existing) {
      existing.addEventListener("load", () => window.ExcelJS ? resolve(window.ExcelJS) : reject(new Error("ExcelJS を読み込めませんでした")));
      existing.addEventListener("error", () => reject(new Error("ExcelJS の読み込みに失敗しました")));
      return;
    }

    const script = document.createElement("script");
    script.src = "/exceljs.min.js";
    script.async = true;
    script.dataset.lib = "exceljs";
    script.onload = () => {
      if (window.ExcelJS) resolve(window.ExcelJS);
      else reject(new Error("ExcelJS を読み込めませんでした"));
    };
    script.onerror = () => reject(new Error("ExcelJS の読み込みに失敗しました"));
    document.head.append(script);
  });

  return excelJsPromise;
}
