/**
 * プログラム型（TYPE_DEFS）・自動検出・巡回訪問週の切替（要件定義 §4.3 / §11）
 */
import type { Meeting, Program, Section, Slot, SlotKind, TypeRule } from "../models";

export interface SlotTemplate {
  roleId: string;
  kind: SlotKind;
  label: string;
}

export interface TypeDef {
  id: string;
  label: string; // レビュー画面での表示名
  section: Section;
  slots: SlotTemplate[];
  noAssign?: boolean; // 割当対象外（巡回監督の話など）
  circuitMarker?: boolean; // この型を含む日は巡回訪問週
  allowOmitPartner?: boolean; // part6「話」: 相手役省略可
}

/** 既定ロール ID（seed と一致。S3 で名称変更可） */
export const RID = {
  prayer: "r_prayer",
  chairman: "r_chairman",
  treasures: "r_treasures",
  gems: "r_gems",
  bibleReading: "r_bible_reading",
  student: "r_student",
  living: "r_living",
  localNeeds: "r_local_needs",
  cbsConductor: "r_cbs_conductor",
  cbsReader: "r_cbs_reader",
} as const;

export const IGNORE_TYPE = "__ignore__";

export const TYPE_DEFS: TypeDef[] = [
  { id: "chairman", label: "司会", section: null,
    slots: [{ roleId: RID.chairman, kind: "single", label: "司会" }] },
  { id: "prayer_open", label: "開会の祈り", section: null,
    slots: [{ roleId: RID.prayer, kind: "single", label: "祈り" }] },
  { id: "treasures_talk", label: "神の言葉の宝（話）", section: "treasures",
    slots: [{ roleId: RID.treasures, kind: "single", label: "話" }] },
  { id: "gems", label: "宝石を探し出す", section: "treasures",
    slots: [{ roleId: RID.gems, kind: "single", label: "話" }] },
  { id: "bible_reading", label: "聖書朗読（part3）", section: "treasures",
    slots: [{ roleId: RID.bibleReading, kind: "single", label: "生徒" }] },
  { id: "ministry_talk", label: "野外奉仕に励む：話", section: "ministry",
    slots: [{ roleId: RID.student, kind: "performer", label: "話" }] },
  { id: "ministry_demo", label: "野外奉仕に励む：実演", section: "ministry",
    slots: [
      { roleId: RID.student, kind: "performer", label: "生徒" },
      { roleId: RID.student, kind: "partner", label: "相手" },
    ] },
  { id: "living_discussion", label: "クリスチャンとして生活する：討議", section: "living",
    slots: [{ roleId: RID.living, kind: "single", label: "討議" }] },
  { id: "local_needs", label: "クリスチャンとして生活する：会衆の必要", section: "living",
    slots: [{ roleId: RID.localNeeds, kind: "single", label: "会衆の必要" }] },
  { id: "cbs", label: "会衆聖書研究（司会＋朗読）", section: "living",
    slots: [
      { roleId: RID.cbsConductor, kind: "single", label: "司会" },
      { roleId: RID.cbsReader, kind: "single", label: "朗読" },
    ] },
  { id: "service_talk", label: "奉仕の話（巡回監督・割当対象外）", section: "living",
    noAssign: true, circuitMarker: true, slots: [] },
  { id: "prayer_close", label: "閉会の祈り", section: null,
    slots: [{ roleId: RID.prayer, kind: "single", label: "祈り" }] },
];

const LEGACY_TYPE_DEFS: TypeDef[] = [
  { id: "demo4", label: "野外奉仕に励む：実演（話以外）", section: "ministry",
    slots: [
      { roleId: RID.student, kind: "performer", label: "生徒" },
      { roleId: RID.student, kind: "partner", label: "相手" },
    ] },
  { id: "demo5", label: "野外奉仕に励む：実演（話以外）", section: "ministry",
    slots: [
      { roleId: RID.student, kind: "performer", label: "生徒" },
      { roleId: RID.student, kind: "partner", label: "相手" },
    ] },
  { id: "demo6", label: "野外奉仕に励む：実演／話", section: "ministry", allowOmitPartner: true,
    slots: [
      { roleId: RID.student, kind: "performer", label: "生徒" },
      { roleId: RID.student, kind: "partner", label: "相手（話の回は省略）" },
    ] },
  { id: "living_talk", label: "クリスチャンとして生活する：討議", section: "living",
    slots: [{ roleId: RID.living, kind: "single", label: "討議" }] },
];

export const typeDef = (id: string): TypeDef | undefined =>
  TYPE_DEFS.find((t) => t.id === id) ?? LEGACY_TYPE_DEFS.find((t) => t.id === id);

/**
 * 型シグネチャ: C列テキストから可変部分（番号・聖書箇所・タイトル）を除いた骨格。
 * レビュー修正の記憶（TypeRule）のキーに使う（§4.3）。
 */
export function normalizeSignature(cText: string): string {
  return cText
    .replace(/「[^」]*」/g, "")
    .replace(/（[^）]*）/g, "")
    .replace(/\([^)]*\)/g, "")
    .replace(/[0-9０-９]+/g, "")
    .replace(/[.．・:：\-－～\s　]/g, "")
    .trim();
}

export interface DetectResult {
  typeId: string; // IGNORE_TYPE = 割当対象外・無視
  omitPartner: boolean;
  auto: boolean; // 自動判定できたか（false = 未分類）
}

/**
 * 1行分の自動検出（§4.3: C列キーワード＋part番号＋E列ラベルの併用）。
 * typeRules（レビュー修正の記憶）が最優先。
 */
export function detectType(
  cText: string,
  eLabel: string,
  typeRules: TypeRule[],
  section: Section = null
): DetectResult {
  const c = cText.trim();
  const sig = normalizeSignature(c);

  const rule = typeRules.find((r) => r.signature === sig && sig !== "");
  if (rule) {
    const typeId = normalizeRuleType(rule.typeId, c, section);
    const def = typeDef(typeId);
    return { typeId, omitPartner: isTalkText(c) && !!def?.allowOmitPartner, auto: true };
  }

  const found = detectByKeywords(c, eLabel, section);
  if (found) return found;
  return { typeId: IGNORE_TYPE, omitPartner: false, auto: false };
}

/** 野外奉仕の項目が「話」の回か */
function isTalkText(c: string): boolean {
  return /話[:：「]/.test(c) || /^[0-9０-９]+[.．]\s*話/.test(c);
}

function normalizeRuleType(typeId: string, c: string, section: Section): string {
  if (typeId === "demo4" || typeId === "demo5") return "ministry_demo";
  if (typeId === "demo6") return isTalkText(c) ? "ministry_talk" : "ministry_demo";
  if (typeId === "living_talk") return "living_discussion";
  if (section === "ministry" && typeId === "service_talk") return "ministry_talk";
  return typeId;
}

function detectByKeywords(c: string, eLabel: string, section: Section): DetectResult | null {
  const r = (typeId: string, omitPartner = false): DetectResult => ({ typeId, omitPartner, auto: true });

  if (section === "living" && /奉仕の話/.test(c)) return r("service_talk");
  if (/会衆の?聖書研究/.test(c)) return r("cbs");
  if (/聖書朗読/.test(c)) return r("bible_reading");
  // 祈りは「開会/閉会の言葉」判定より優先。開会の言葉行に E列「祈り：」が付く形式
  // （開会の祈り）を拾うため。C列に「開会」を含めば開会、それ以外（歌番号など）は閉会。
  if (/祈り/.test(c) || /祈り/.test(eLabel)) {
    return r(/開会/.test(c) ? "prayer_open" : "prayer_close");
  }
  if (/開会のことば|開会の言葉/.test(c)) return r("chairman");
  if (/閉会のことば|閉会の言葉/.test(c)) return r(IGNORE_TYPE); // 司会者が続けて担当（割当なし）

  const numMatch = c.match(/^\s*([0-9０-９]+)[.．]/);
  if (numMatch) {
    const n = Number(numMatch[1].replace(/[０-９]/g, (d) => String("０１２３４５６７８９".indexOf(d))));
    if (n === 1) return r("treasures_talk");
    if (n === 2) return r("gems");
    if (n === 3) return r("bible_reading");
    if (section === "ministry") return r(isTalkText(c) ? "ministry_talk" : "ministry_demo");
    if (section === "living") {
      if (/会衆の?必要/.test(c)) return r("local_needs");
      if (/会衆の?聖書研究/.test(c)) return r("cbs");
      return r("living_discussion");
    }
  }
  if (/宝石/.test(c)) return r("gems");

  // E列ラベルによる補完（§11: ラベルは不完全）
  if (/司会者\/朗読者/.test(eLabel)) return r("cbs");
  if (section === "ministry" && /生徒\/相手/.test(eLabel)) return r("ministry_demo");
  if (section === "ministry" && /生徒/.test(eLabel)) return r(isTalkText(c) ? "ministry_talk" : "ministry_demo");
  if (section === "living" && /会衆の?必要/.test(c)) return r("local_needs");
  if (section === "living" && /討議|話/.test(c)) return r("living_discussion");

  // 歌の行は無視。実データでは C 列が「歌番号（裸の整数）」のみのことが多く、
  // 「歌xxx番」書式も含めてまとめて弾く（例: 106 / 109 → 賛美の歌）。
  if (/^歌\s*[0-9０-９]/.test(c) || /^[0-9０-９]+番/.test(c) || /^[0-9０-９]+$/.test(c))
    return r(IGNORE_TYPE);

  return null;
}

/** 型からプログラムを組み立てる（スロットキーは後で renumber） */
export function buildProgram(typeId: string, name: string, omitPartner = false): Program {
  const def = typeDef(typeId);
  return {
    key: "",
    typeId,
    name,
    section: def?.section ?? null,
    noAssign: def?.noAssign ?? false,
    omitPartner: omitPartner && !!def?.allowOmitPartner,
    slots: (def?.slots ?? []).map((s) => ({ ...s, key: "" })),
  };
}

/** プログラム・スロットのキーを振り直す（"p{i}" / "p{i}-s{j}"） */
export function renumberPrograms(programs: Program[]): void {
  programs.forEach((p, pi) => {
    p.key = `p${pi}`;
    p.slots.forEach((s: Slot, si) => (s.key = `p${pi}-s${si}`));
  });
}

/** 集会の有効スロット数（omitPartner の相手役は数えない） */
export function totalSlotCount(meeting: Meeting): number {
  return meeting.programs.reduce((n, p) => {
    if (p.noAssign) return n;
    return n + p.slots.filter((s) => !(p.omitPartner && s.kind === "partner")).length;
  }, 0);
}

/** 巡回訪問週の切替（S7 ヘッダのトグル・案A）で影響を受けるスロットキー */
export function circuitAffectedSlotKeys(meeting: Meeting): string[] {
  const target = meeting.circuit ? "service_talk" : "cbs";
  return meeting.programs
    .filter((p) => p.typeId === target)
    .flatMap((p) => p.slots.map((s) => s.key));
}

/**
 * 巡回訪問週を切り替える。cbs ⇄ service_talk のプログラムを差し替え、
 * 消えるスロットの割当を除去する。書き戻し位置（srcSheet/srcRow）は引き継ぐ。
 */
export function setCircuit(meeting: Meeting, circuit: boolean): void {
  if (meeting.circuit === circuit) return;
  const fromId = circuit ? "cbs" : "service_talk";
  const toId = circuit ? "service_talk" : "cbs";
  const toName = circuit ? "奉仕の話（巡回監督）" : "会衆聖書研究";
  meeting.programs = meeting.programs.map((p) => {
    if (p.typeId !== fromId) return p;
    for (const s of p.slots) delete meeting.assignments[s.key];
    const np = buildProgram(toId, toName);
    np.srcSheet = p.srcSheet;
    np.srcRow = p.srcRow;
    return np;
  });
  renumberPrograms(meeting.programs);
  meeting.circuit = circuit;
}
