/**
 * PDF 履歴インポート（要件定義 §4.7: 記入済み PDF から実績を初期投入）
 * 注意: 実 PDF のテキスト抽出検証は §10 の残タスク。行復元・名前抽出の
 * ヒューリスティックはこのファイルに集約してある。
 */
import type { AppData } from "../models";
import { detectType, typeDef, IGNORE_TYPE } from "../logic/programs";

type PdfJsLib = typeof import("pdfjs-dist");

let pdfjsPromise: Promise<PdfJsLib> | null = null;

async function loadPdfJs(): Promise<PdfJsLib> {
  if (!pdfjsPromise) {
    const pdfjsUrl = "/pdf.mjs";
    pdfjsPromise = import(/* @vite-ignore */ pdfjsUrl) as Promise<PdfJsLib>;
    const pdfjs = await pdfjsPromise;
    pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  }
  return pdfjsPromise;
}

export interface ExtractedEntry {
  date: string; // ISO
  progLabel: string; // 表示用（何の項目か）
  roleId: string;
  rawName: string; // PDF 上の表記
  matchedId: string | null; // 名寄せ結果（null = 要確認）
  /** 実演のペア: 演者行とひとまとまりで登録するための組 ID */
  pairGroup?: string;
  pairIndex?: 0 | 1; // 0=演者, 1=相手役
}

/** 氏名の正規化: 空白（半角・全角）を除去して比較する（§4.7 フルネーム名寄せ） */
export function normalizeName(s: string): string {
  return s.replace(/[\s　]/g, "");
}

/** 名寄せ: エイリアス記憶 → 正規化フルネーム完全一致（一意のときだけ自動確定） */
export function matchMember(data: AppData, rawName: string): string | null {
  const alias = data.nameAliases.find((a) => a.raw === rawName);
  if (alias) return alias.memberId;
  const key = normalizeName(rawName);
  if (!key) return null;
  const hits = data.members.filter((m) => normalizeName(m.name) === key);
  return hits.length === 1 ? hits[0].id : null;
}

const toIso = (y: number, m: number, d: number): string =>
  `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

/** テキスト行の再構成: Y座標でグルーピングし X順に連結 */
async function extractLines(data: Uint8Array): Promise<string[]> {
  const pdfjs = await loadPdfJs();
  const doc = await pdfjs.getDocument({ data: data.slice(0) }).promise;
  const lines: string[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const byY = new Map<number, { x: number; str: string }[]>();
    for (const item of content.items) {
      if (!("str" in item) || !item.str.trim()) continue;
      const y = Math.round(item.transform[5] / 3) * 3; // 3pt 単位で同一行とみなす
      if (!byY.has(y)) byY.set(y, []);
      byY.get(y)!.push({ x: item.transform[4], str: item.str });
    }
    const ys = [...byY.keys()].sort((a, b) => b - a); // PDF は下原点なので降順=上から
    for (const y of ys) {
      const parts = byY.get(y)!.sort((a, b) => a.x - b.x).map((i) => i.str);
      lines.push(parts.join(" ").trim());
    }
  }
  return lines;
}

/** 行から担当者名部分を取り出す（ラベル「〜：」の後ろ、または実演の「A / B」） */
function namesFromLine(line: string): string[] {
  // 最後の「：」以降を名前領域とみなす（例: "生徒/相手：鈴木 花子 / 田中 美咲"）
  const colonIdx = Math.max(line.lastIndexOf("："), line.lastIndexOf(":"));
  const zone = colonIdx >= 0 ? line.slice(colonIdx + 1) : "";
  if (!zone.trim()) return [];
  return zone
    .split(/[/／]/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 2 && !/^\d+$/.test(s));
}

/**
 * PDF から担当実績を抽出する。プログラム型の検出は Excel 取り込みと同じ
 * detectType を使う（レイアウトが同一のため §4.7）。
 */
export async function extractHistoryFromPdf(
  pdfData: Uint8Array,
  data: AppData
): Promise<ExtractedEntry[]> {
  const lines = await extractLines(pdfData);
  const out: ExtractedEntry[] = [];
  let currentDate: string | null = null;
  let fallbackYear = new Date().getFullYear();
  let pairSeq = 0;

  for (const line of lines) {
    let m = line.match(/(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/);
    if (m) {
      currentDate = toIso(Number(m[1]), Number(m[2]), Number(m[3]));
      fallbackYear = Number(m[1]);
    } else {
      m = line.match(/(\d{1,2})\s*月\s*(\d{1,2})\s*日/);
      if (m && /週|曜|集会/.test(line)) {
        currentDate = toIso(fallbackYear, Number(m[1]), Number(m[2]));
      }
    }
    if (!currentDate) continue;

    const det = detectType(line, line, data.typeRules);
    if (det.typeId === IGNORE_TYPE || !det.auto) continue;
    const def = typeDef(det.typeId);
    if (!def || def.noAssign || def.slots.length === 0) continue;

    const names = namesFromLine(line);
    if (names.length === 0) continue;

    const isPair = def.slots.length === 2 && def.slots[1].kind === "partner";
    const group = isPair && names.length >= 2 ? `pg${pairSeq++}` : undefined;

    names.slice(0, def.slots.length).forEach((rawName, i) => {
      const slot = def.slots[Math.min(i, def.slots.length - 1)];
      out.push({
        date: currentDate!,
        progLabel: def.label,
        roleId: slot.roleId,
        rawName,
        matchedId: matchMember(data, rawName),
        pairGroup: group,
        pairIndex: group ? (i as 0 | 1) : undefined,
      });
    });
  }
  return out;
}
