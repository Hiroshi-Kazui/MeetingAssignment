/**
 * Excel エクスポート（要件定義 §4.5: 元ワークブックの E列へ名前を追記し別名保存）
 * ExcelJS は既存の書式・結合セルを保持したまま書き戻せる（§3。実ファイル検証は §10）。
 */
import type ExcelJS from "exceljs";
import type { AppData, Meeting } from "../models";
import { byId } from "../models";
import { loadExcelJS } from "./exceljs";

const COL_E = 5;

export interface ExportWarning {
  date: string;
  message: string;
}

/**
 * テンプレートに割当済みの名前を書き戻し、新しい xlsx のバイト列を返す。
 * 書き戻し先は取り込み時に記録した srcSheet/srcRow（§4.3 で記録）。
 */
export async function exportWorkbook(
  templateData: Uint8Array,
  meetings: Meeting[],
  data: AppData
): Promise<{ bytes: Uint8Array; warnings: ExportWarning[] }> {
  const ExcelJS = await loadExcelJS();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(
    templateData.buffer.slice(
      templateData.byteOffset,
      templateData.byteOffset + templateData.byteLength
    ) as ArrayBuffer
  );

  const warnings: ExportWarning[] = [];

  for (const mt of meetings) {
    for (const prog of mt.programs) {
      if (prog.noAssign || prog.slots.length === 0) continue;
      if (!prog.srcSheet || !prog.srcRow) {
        warnings.push({ date: mt.date, message: `${prog.name}: 書き戻し先が不明のためスキップ` });
        continue;
      }
      const ws = wb.getWorksheet(prog.srcSheet);
      if (!ws) {
        warnings.push({ date: mt.date, message: `シート「${prog.srcSheet}」が見つかりません` });
        continue;
      }

      // スロット順に名前を並べ、2枠は "/" 区切り（§4.5）。敬称なし
      const names = prog.slots
        .filter((s) => !(prog.omitPartner && s.kind === "partner"))
        .map((s) => {
          const memberId = mt.assignments[s.key];
          return memberId ? byId(data.members, memberId)?.name ?? "" : "";
        });
      if (names.every((n) => n === "")) continue; // 未割当はセルをそのまま残す

      const cell = ws.getRow(prog.srcRow).getCell(COL_E);
      const label = plainText(cell.value).trim();
      const joined = names.map((n) => n || "＿").join(" / ");
      cell.value = label ? `${label}${joined}` : joined;
    }
  }

  const buf = await wb.xlsx.writeBuffer();
  return { bytes: new Uint8Array(buf as ArrayBuffer), warnings };
}

function plainText(v: ExcelJS.CellValue): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "object" && "richText" in v) return v.richText.map((r) => r.text).join("");
  return String(v);
}
