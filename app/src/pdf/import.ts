/**
 * PDF 履歴インポート（要件定義 §4.7: 記入済み PDF から実績を初期投入）
 * 注意: 実 PDF のテキスト抽出検証は §10 の残タスク。行復元・名前抽出の
 * ヒューリスティックはこのファイルに集約してある。
 */
import type { AppData, Meeting, Section } from "../models";
import { detectType, typeDef, IGNORE_TYPE } from "../logic/programs";

type PdfJsLib = typeof import("pdfjs-dist");

let pdfjsPromise: Promise<PdfJsLib> | null = null;

async function loadPdfJs(): Promise<PdfJsLib> {
  if (!pdfjsPromise) {
    // public/pdf.mjs を fetch → Blob URL 経由で import する。
    // Vite dev では public の ESM を直接 import("/pdf.mjs") すると ?import が付与され、
    // モジュールグラフに無いため SPA フォールバックの HTML が返り
    // "Failed to fetch dynamically imported module" になる。fetch した本体を
    // Blob module 化して読み込むことでこれを回避する（pdf.mjs は自己完結）。
    // 本番(dist)でも /pdf.mjs は静的配信されるため同一経路で動作し、
    // rollup も巨大な pdfjs を bundle しない。ワーカーは明示的に public を指す。
    pdfjsPromise = (async () => {
      const res = await fetch("/pdf.mjs");
      if (!res.ok) throw new Error(`pdf.mjs の取得に失敗しました (${res.status})`);
      const url = URL.createObjectURL(
        new Blob([await res.text()], { type: "text/javascript" })
      );
      try {
        const pdfjs = (await import(/* @vite-ignore */ url)) as PdfJsLib;
        pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
        return pdfjs;
      } finally {
        URL.revokeObjectURL(url);
      }
    })();
  }
  return pdfjsPromise;
}

export interface ExtractedEntry {
  date: string; // ISO
  progLabel: string; // 表示用（何の項目か）
  typeId: string; // TYPE_DEFS の型 ID（集会スロットへのマッピングに使用）
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

/** 行頭の時刻＋中黒プレフィックス（例: "6:51 ● "）。除去して Excel と同じ本文にする */
const TIME_PREFIX = /^\d{1,2}:\d{2}\s*[●○•・]?\s*/;

/** セクション見出し行の判定（fill_s89.py の FIELD_SECTION_* と同じ区切り） */
function sectionOf(text: string): Section | undefined {
  if (/神の言葉の宝/.test(text)) return "treasures";
  if (/野外奉仕に励む/.test(text)) return "ministry";
  if (/クリスチャンとして生活する/.test(text)) return "living";
  return undefined;
}

/**
 * 行から担当者名を取り出す。
 * - ラベル「〜：」がある行（生徒：/生徒/相手：/司会者：/祈り：）はその後ろ
 * - ラベルが無い行（宝の話・討議・会衆聖書研究など）は末尾の所要時間 "(N分)" 以降
 *   （fill_s89.py は S-89 対象のラベル行のみだが、履歴は全役割を拾うため拡張）
 * 2枠（実演の生徒/相手, 研究の司会/朗読）は "A / B" を "/" で分割する。
 */
export function namesFromLine(core: string): string[] {
  const colonIdx = Math.max(core.lastIndexOf("："), core.lastIndexOf(":"));
  let zone: string;
  if (colonIdx >= 0) {
    zone = core.slice(colonIdx + 1);
  } else {
    const durs = [...core.matchAll(/[（(]\s*\d+\s*分\s*[）)]/g)];
    if (durs.length === 0) return [];
    const last = durs[durs.length - 1];
    zone = core.slice((last.index ?? 0) + last[0].length);
  }
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
  return parseHistoryLines(lines, data);
}

/**
 * 抽出済みテキスト行から担当実績を組み立てる純粋関数（単体検証用に分離）。
 * fill_s89.py の parse_assignments を参考に、日付行・セクション・
 * 「時刻 ● 番号. 本文 … 担当者」形式を解釈する。
 */
export function parseHistoryLines(lines: string[], data: AppData): ExtractedEntry[] {
  const out: ExtractedEntry[] = [];
  let currentDate: string | null = null;
  let currentSection: Section = null;
  let fallbackYear = new Date().getFullYear();
  let pairSeq = 0;
  const chairmanDef = typeDef("chairman");
  const chairmanRole = chairmanDef?.slots[0]?.roleId ?? "";
  const prayerSeen = new Set<string>();

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    // 日付行: "YYYY年M月D日" または "M月D日(曜日)"（後者は PDF の週見出し）
    let dm = line.match(/(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/);
    if (dm) {
      currentDate = toIso(Number(dm[1]), Number(dm[2]), Number(dm[3]));
      fallbackYear = Number(dm[1]);
    } else {
      dm = line.match(/^\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日\s*[（(]/);
      if (dm) currentDate = toIso(fallbackYear, Number(dm[1]), Number(dm[2]));
    }
    if (dm) {
      currentSection = null;
      // 週見出し行に "司会者：名前" があれば司会を登録
      const cm = line.match(/司会者\s*[:：]\s*(.+)$/);
      if (cm && currentDate && chairmanRole) {
        const nm = cm[1].trim();
        if (nm.length >= 2)
          out.push({
            date: currentDate,
            progLabel: chairmanDef!.label,
            typeId: "chairman",
            roleId: chairmanRole,
            rawName: nm,
            matchedId: matchMember(data, nm),
          });
      }
      continue;
    }
    if (!currentDate) continue;

    // セクション見出し（時刻を含まない行のみ）
    const sec = sectionOf(line);
    if (sec !== undefined && !/\d{1,2}:\d{2}/.test(line)) {
      currentSection = sec;
      continue;
    }

    // 時刻プレフィックスを外して Excel の C列相当の本文にする
    const core = line.replace(TIME_PREFIX, "").trim();
    if (!core) continue;

    let det = detectType(core, core, data.typeRules, currentSection);
    if (det.typeId === IGNORE_TYPE || !det.auto) continue;

    // その日最初の祈りは開会、以降は閉会（役割 r_prayer は同一）
    if (det.typeId === "prayer_open" || det.typeId === "prayer_close") {
      const isOpen = !prayerSeen.has(currentDate);
      prayerSeen.add(currentDate);
      det = { ...det, typeId: isOpen ? "prayer_open" : "prayer_close" };
    }

    const def = typeDef(det.typeId);
    if (!def || def.noAssign || def.slots.length === 0) continue;

    const names = namesFromLine(core);
    if (names.length === 0) continue;

    const isPair = def.slots.length === 2 && def.slots[1].kind === "partner";
    const group = isPair && names.length >= 2 ? `pg${pairSeq++}` : undefined;

    names.slice(0, def.slots.length).forEach((rawName, i) => {
      const slot = def.slots[Math.min(i, def.slots.length - 1)];
      out.push({
        date: currentDate!,
        progLabel: def.label,
        typeId: det.typeId,
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

/**
 * 抽出エントリを取り込み済み集会のスロットへマッピングする（§4.7）。
 * 1パス目: typeId＋roleId の完全一致（文書順＝プログラム順の前提で貪欲に割付）。
 * 2パス目: roleId のみで残りを補完（Excel レビューで型が demo⇄talk に修正された
 * ケースの吸収）。ただし祈りは open/close の取り違えを防ぐためフォールバックしない。
 * ペア（演者/相手役）は同一プログラムに収める。
 * 戻り値: スロットキー→成員ID と、マッピングできたエントリの index 集合。
 */
export function mapEntriesToAssignments(
  meeting: Meeting,
  entries: ExtractedEntry[]
): { assignments: Record<string, string>; used: Set<number> } {
  const assignments: Record<string, string> = {};
  const used = new Set<number>();
  const pairProgram = new Map<string, Meeting["programs"][number]>();

  const tryAssign = (ei: number, requireType: boolean): void => {
    const e = entries[ei];
    if (used.has(ei) || !e.matchedId) return;
    if (!requireType && e.roleId === "r_prayer") return; // 祈りは型一致のみ
    for (const p of meeting.programs) {
      if (p.noAssign) continue;
      if (requireType && p.typeId !== e.typeId) continue;
      // ペアの相手役は演者と同じプログラムへ
      if (e.pairGroup && e.pairIndex === 1) {
        const perfProg = pairProgram.get(e.pairGroup);
        if (perfProg && perfProg !== p) continue;
      }
      for (const s of p.slots) {
        if (s.roleId !== e.roleId) continue;
        if (p.omitPartner && s.kind === "partner") continue;
        if (e.pairGroup && e.pairIndex === 0 && s.kind === "partner") continue;
        if (e.pairGroup && e.pairIndex === 1 && s.kind !== "partner") continue;
        if (assignments[s.key]) continue;
        assignments[s.key] = e.matchedId;
        used.add(ei);
        if (e.pairGroup && e.pairIndex === 0) pairProgram.set(e.pairGroup, p);
        return;
      }
    }
  };

  for (let i = 0; i < entries.length; i++) tryAssign(i, true);
  for (let i = 0; i < entries.length; i++) tryAssign(i, false);
  return { assignments, used };
}
