/**
 * Excel 取り込み（要件定義 §4.3 / §11: 1シート=2週分、自動検出＋レビュー確定）
 * 注意: 実ファイルでの列対応検証は §10 の残タスク。列位置・日付書式は
 * ここに集約してあるので、実物で崩れた場合はこのファイルだけ直せばよい。
 */
import type ExcelJS from "exceljs";
import type { Meeting, MeetingSongs, Section, TypeRule } from "../models";
import { newId } from "../models";
import { loadExcelJS } from "./exceljs";
import {
  IGNORE_TYPE,
  buildProgram,
  detectType,
  renumberPrograms,
  typeDef,
} from "../logic/programs";

/** 列位置（1始まり）。サンプル Excel §11 に基づく */
const COL_A = 1; // 集会日（A列にのみ入る）
const COL_C = 3; // 項目名（キーワード判定の主対象）
const COL_E = 5; // 担当ラベル（司会者：/生徒： など。不完全）

export interface DetectedRow {
  sheet: string;
  row: number; // 1始まり（エクスポート書き戻し先）
  cText: string;
  eText: string;
  typeId: string; // IGNORE_TYPE = 無視
  omitPartner: boolean;
  auto: boolean; // false = 未分類（レビューで要選択）
}

export interface MeetingDraft {
  date: string; // ISO（レビューで修正可能）
  sheet: string;
  circuit: boolean; // 奉仕の話を検出した週
  rows: DetectedRow[];
  scripture?: string; // 日付行 D列（例: "エレミヤ 31章"）
  songs: MeetingSongs; // 歌番号（開会・中間・閉会）。エクスポートのシート生成に使用
}

/** セル値をプレーン文字列へ（richText・数式結果対応） */
function cellText(cell: ExcelJS.Cell): string {
  const v = cell.value;
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "object") {
    if ("richText" in v) return v.richText.map((r) => r.text).join("");
    if ("result" in v) return String(v.result ?? "");
    if ("text" in v) return String((v as { text: unknown }).text ?? "");
  }
  return String(v);
}

const toIso = (y: number, m: number, d: number): string =>
  `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

/**
 * 集会日を返す（Date セル / "YYYY年M月D日" / "M月D日"）。
 * 集会日は A列にのみ入るため A列だけを見る。行内の他列テキスト（例: C列の
 * 「7.3月7日…のキャンペーン」）を日付と誤検出して幻の集会を作らないため。
 */
function findDateInRow(row: ExcelJS.Row, fallbackYear: number): string | null {
  const cell = row.getCell(COL_A);
  const v = cell.value;
  if (v instanceof Date) {
    // Excel の「時刻」セル（開始時刻など）は 1899-12-30 を基点とする通日で
    // Date 化されるため、そのままだと集会日付（例: 1899-12-30）と誤認する。
    // 実データは西暦の日付セルなので、1900 年より前は時刻値として無視する。
    // ExcelJS は日付を UTC 00:00 で読むため UTC ゲッタで日付を取り出す。
    if (v.getUTCFullYear() >= 1900) {
      return toIso(v.getUTCFullYear(), v.getUTCMonth() + 1, v.getUTCDate());
    }
    return null;
  }
  const t = cellText(cell);
  let m = t.match(/(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/);
  if (m) return toIso(Number(m[1]), Number(m[2]), Number(m[3]));
  m = t.match(/(\d{1,2})\s*月\s*(\d{1,2})\s*日/);
  if (m) return toIso(fallbackYear, Number(m[1]), Number(m[2]));
  return null;
}

function sectionHeading(cText: string): Section | undefined {
  if (/神の言葉の宝/.test(cText)) return "treasures";
  if (/野外奉仕に励む/.test(cText)) return "ministry";
  if (/クリスチャンとして生活する/.test(cText)) return "living";
  return undefined;
}

/**
 * ワークブック全体を解析し、集会日単位のドラフトへ分割する。
 * typeRules はレビュー修正の記憶（§4.3: 型シグネチャ単位で次回自動適用）。
 */
export async function parseWorkbook(
  data: Uint8Array,
  typeRules: TypeRule[]
): Promise<MeetingDraft[]> {
  const ExcelJS = await loadExcelJS();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer);

  const drafts: MeetingDraft[] = [];
  let fallbackYear = new Date().getFullYear();

  for (const ws of wb.worksheets) {
    let current: MeetingDraft | null = null;
    let currentSection: Section = null;
    let afterClosing = false; // 「閉会の言葉」行より後か（閉会の歌の判定用）
    for (let r = 1; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      const date = findDateInRow(row, fallbackYear);
      if (date) {
        fallbackYear = Number(date.slice(0, 4));
        currentSection = null;
        afterClosing = false;
        current = {
          date, sheet: ws.name, circuit: false, rows: [],
          scripture: cellText(row.getCell(4)).trim() || undefined,
          songs: {},
        };
        drafts.push(current);
        // 日付行の E列に司会者ラベルがある場合はここが司会スロット（§11）
        const eOnDate = cellText(row.getCell(COL_E)).trim();
        if (/司会者/.test(eOnDate)) {
          current.rows.push({
            sheet: ws.name, row: r, cText: "（日付行）司会者",
            eText: eOnDate, typeId: "chairman", omitPartner: false, auto: true,
          });
        }
        continue;
      }
      if (!current) continue;

      const cText = cellText(row.getCell(COL_C)).trim();
      if (!cText) continue;
      const heading = sectionHeading(cText);
      if (heading !== undefined) {
        currentSection = heading;
        continue;
      }
      // 歌番号（C列が数字のみ）を記録（§4.5: エクスポートのシート生成に使用）。
      // 行自体は従来どおり検出フローへ（祈りラベル付きなら祈りスロットになる）
      if (/^[0-9０-９]+$/.test(cText)) {
        const num = Number(cText.replace(/[０-９]/g, (ch) => String("０１２３４５６７８９".indexOf(ch))));
        if (currentSection === null) current.songs.open = num;
        else if (afterClosing) current.songs.close = num;
        else current.songs.middle = num;
      }
      if (/閉会の(ことば|言葉)/.test(cText)) afterClosing = true;
      const eText = cellText(row.getCell(COL_E)).trim();

      const det = detectType(cText, eText, typeRules, currentSection);
      current.rows.push({
        sheet: ws.name, row: r, cText, eText,
        typeId: det.typeId, omitPartner: det.omitPartner, auto: det.auto,
      });
    }
  }

  // 後処理: ブロック先頭側の祈りは「開会の祈り」に補正し、巡回週フラグを立てる
  for (const d of drafts) {
    const prayers = d.rows.filter((r) => r.typeId === "prayer_close" || r.typeId === "prayer_open");
    if (prayers.length >= 2) prayers[0].typeId = "prayer_open";
    d.circuit = d.rows.some((r) => typeDef(r.typeId)?.circuitMarker);
    // 司会が重複検出された場合は最初の1つだけ残す
    const chairs = d.rows.filter((r) => r.typeId === "chairman");
    for (const c of chairs.slice(1)) c.typeId = IGNORE_TYPE;
  }
  return drafts;
}

/** レビュー確定後のドラフトを Meeting に変換する */
export function draftToMeeting(draft: MeetingDraft, srcFileName: string): Meeting {
  const programs = draft.rows
    .filter((r) => r.typeId !== IGNORE_TYPE)
    .map((r) => {
      const p = buildProgram(r.typeId, displayName(r), r.omitPartner);
      p.srcSheet = r.sheet;
      p.srcRow = r.row;
      return p;
    });
  renumberPrograms(programs);
  return {
    id: newId("mt"),
    date: draft.date,
    circuit: draft.rows.some((r) => typeDef(r.typeId)?.circuitMarker),
    status: "none",
    programs,
    assignments: {},
    srcFileName,
    scripture: draft.scripture,
    songs: draft.songs,
  };
}

function displayName(r: DetectedRow): string {
  if (r.cText.startsWith("（日付行）")) return typeDef(r.typeId)?.label ?? r.cText;
  // 祈りの行は C列が歌番号だけ（例: "27"）なので、型ラベルを表示名にする
  if (r.typeId === "prayer_open" || r.typeId === "prayer_close") {
    return typeDef(r.typeId)?.label ?? r.cText;
  }
  return r.cText;
}
