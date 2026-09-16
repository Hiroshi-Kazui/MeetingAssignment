/**
 * プログラム型（TYPE_DEFS）・自動検出・巡回訪問週の切替（要件定義 §4.3 / §11）
 */
import type { AppData, Meeting, Program, Section, SectionAlias, Slot, SlotKind, TypeKeyword } from "../models";

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
  allowGbTalk?: boolean; // 会衆の必要「統治体の話」: 動画のみ・司会省略可
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

/**
 * プログラム名の「当て先」。ワークブックは項目名だけを改称することがあるため
 * （例:「会衆の必要」→「会衆で考えたいこと」）、名前そのものは AppData.typeKeywords
 * にデータとして持ち、利用者が設定画面から追加できるようにしている。
 * ここにあるのは当て先の一覧とその表示名だけ。
 */
export const KEYWORD_TARGETS = {
  local_needs: "会衆で考えたいこと（part7）",
  cbs: "会衆聖書研究（part8）",
  service_talk: "奉仕の話（巡回監督）",
  bible_reading: "聖書朗読（part3）",
  gems: "宝石を探し出す（part2）",
  opening_words: "開会の言葉",
  closing_words: "閉会の言葉",
  prayer: "祈り",
} as const;

export type KeywordTarget = keyof typeof KEYWORD_TARGETS;

/** その語が当て先のいずれかの呼び方に一致するか（部分一致） */
export function matchesKeyword(text: string, target: KeywordTarget, keywords: TypeKeyword[]): boolean {
  return keywords.some((k) => k.target === target && k.keyword && text.includes(k.keyword));
}

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
  { id: "ministry_talk", label: "伝道を楽しもう：話", section: "ministry",
    slots: [{ roleId: RID.student, kind: "performer", label: "話" }] },
  { id: "ministry_demo", label: "伝道を楽しもう：実演", section: "ministry",
    slots: [
      { roleId: RID.student, kind: "performer", label: "生徒" },
      { roleId: RID.student, kind: "partner", label: "相手" },
    ] },
  { id: "living_discussion", label: "クリスチャンとして生活する：討議", section: "living",
    slots: [{ roleId: RID.living, kind: "single", label: "討議" }] },
  { id: "local_needs", label: "クリスチャンとして生活する：会衆で考えたいこと", section: "living",
    allowGbTalk: true,
    slots: [{ roleId: RID.localNeeds, kind: "single", label: "会衆で考えたいこと" }] },
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
  { id: "demo4", label: "伝道を楽しもう：実演（話以外）", section: "ministry",
    slots: [
      { roleId: RID.student, kind: "performer", label: "生徒" },
      { roleId: RID.student, kind: "partner", label: "相手" },
    ] },
  { id: "demo5", label: "伝道を楽しもう：実演（話以外）", section: "ministry",
    slots: [
      { roleId: RID.student, kind: "performer", label: "生徒" },
      { roleId: RID.student, kind: "partner", label: "相手" },
    ] },
  { id: "demo6", label: "伝道を楽しもう：実演／話", section: "ministry", allowOmitPartner: true,
    slots: [
      { roleId: RID.student, kind: "performer", label: "生徒" },
      { roleId: RID.student, kind: "partner", label: "相手（話の回は省略）" },
    ] },
  { id: "living_talk", label: "クリスチャンとして生活する：討議", section: "living",
    slots: [{ roleId: RID.living, kind: "single", label: "討議" }] },
];

/**
 * セクションの短い区分名（設定画面の一覧用）。表示名（SECTION_TITLE）は
 * ワークブックの呼び方そのものなので、呼び方の一覧に並べると同じ語が
 * 二重に出て紛らわしい。区分は part 番号で示して呼び方と混ざらないようにする。
 */
export const SECTION_GROUP: Record<Exclude<Section, null>, string> = {
  treasures: "宝（part1-3）",
  ministry: "伝道（part4-6）",
  living: "生活（part7-8）",
};

/** セクションの表示名（割当画面の見出し・設定画面の選択肢で共用） */
export const SECTION_TITLE: Record<Exclude<Section, null>, string> = {
  treasures: "神の言葉の宝",
  ministry: "伝道を楽しもう",
  living: "クリスチャンとして生活する",
};

/**
 * セクション見出しの判定（Excel の C列・PDF の行テキスト共通）。
 * 別名マスタ（AppData.sectionAliases）を順に見て最初に一致したものを返す。
 * 一致しなければ undefined（＝見出し行ではない）。
 *
 * 見出し行は part 番号で始まらないため、番号始まりの行は候補から外す。
 * 別名は利用者が追加できるので、短い語（例「伝道」）を登録されると
 * 「4. 会話を始める…家から家の伝道。」のようなプログラム行が見出し扱いで
 * 捨てられ、未分類にもならず黙って消える。その経路を塞ぐための防御。
 */
export function sectionFromHeading(text: string, aliases: SectionAlias[]): Section | undefined {
  if (/^\s*[0-9０-９]+[.．]/.test(text)) return undefined;
  for (const a of aliases) {
    if (a.keyword && text.includes(a.keyword)) return a.section;
  }
  return undefined;
}

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
 * data.typeRules（レビュー修正の記憶）が最優先。
 */
export function detectType(
  cText: string,
  eLabel: string,
  data: AppData,
  section: Section = null
): DetectResult {
  const c = cText.trim();
  const sig = normalizeSignature(c);

  const rule = data.typeRules.find((r) => r.signature === sig && sig !== "");
  if (rule) {
    const typeId = normalizeRuleType(rule.typeId, c, section);
    const def = typeDef(typeId);
    return { typeId, omitPartner: isTalkText(c) && !!def?.allowOmitPartner, auto: true };
  }

  const found = detectByKeywords(c, eLabel, section, data.typeKeywords);
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

function detectByKeywords(
  c: string,
  eLabel: string,
  section: Section,
  kw: TypeKeyword[]
): DetectResult | null {
  const r = (typeId: string, omitPartner = false): DetectResult => ({ typeId, omitPartner, auto: true });

  if (section === "living" && matchesKeyword(c, "service_talk", kw)) return r("service_talk");
  if (matchesKeyword(c, "cbs", kw)) return r("cbs");
  if (matchesKeyword(c, "bible_reading", kw)) return r("bible_reading");
  // 祈りは「開会/閉会の言葉」判定より優先。開会の言葉行に E列「祈り：」が付く形式
  // （開会の祈り）を拾うため。C列に「開会」を含めば開会、それ以外（歌番号など）は閉会。
  if (matchesKeyword(c, "prayer", kw) || matchesKeyword(eLabel, "prayer", kw)) {
    return r(/開会/.test(c) ? "prayer_open" : "prayer_close");
  }
  if (matchesKeyword(c, "opening_words", kw)) return r("chairman");
  if (matchesKeyword(c, "closing_words", kw)) return r(IGNORE_TYPE); // 司会者が続けて担当（割当なし）

  const numMatch = c.match(/^\s*([0-9０-９]+)[.．]/);
  if (numMatch) {
    const n = Number(numMatch[1].replace(/[０-９]/g, (d) => String("０１２３４５６７８９".indexOf(d))));
    if (n === 1) return r("treasures_talk");
    if (n === 2) return r("gems");
    if (n === 3) return r("bible_reading");
    if (section === "ministry") return r(isTalkText(c) ? "ministry_talk" : "ministry_demo");
    if (section === "living") {
      if (matchesKeyword(c, "local_needs", kw)) return r("local_needs");
      if (matchesKeyword(c, "cbs", kw)) return r("cbs");
      return r("living_discussion");
    }
  }
  if (matchesKeyword(c, "gems", kw)) return r("gems");

  // E列ラベルによる補完（§11: ラベルは不完全）
  if (/司会者\/朗読者/.test(eLabel)) return r("cbs");
  if (section === "ministry" && /生徒\/相手/.test(eLabel)) return r("ministry_demo");
  if (section === "ministry" && /生徒/.test(eLabel)) return r(isTalkText(c) ? "ministry_talk" : "ministry_demo");
  if (section === "living" && matchesKeyword(c, "local_needs", kw)) return r("local_needs");
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
    if (p.noAssign || p.gbTalk) return n; // 統治体の話（動画のみ）は割当対象外
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
