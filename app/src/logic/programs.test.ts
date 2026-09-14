/**
 * プログラム型の自動検出・セクション見出し判定の回帰テスト。
 *
 * ワークブックは構造を変えずに名前だけを改称することがあるため（§4.3）、
 * 新旧どちらの名前でも同じ型に落ちることを固定する。
 */
import { describe, expect, it } from "vitest";
import type { SectionAlias } from "../models";
import { defaultData } from "../state";
import { detectType, sectionFromHeading } from "./programs";

const ALIASES: SectionAlias[] = [
  { id: "sa_treasures", keyword: "神の言葉の宝", section: "treasures", builtin: true },
  { id: "sa_ministry_old", keyword: "野外奉仕に励む", section: "ministry", builtin: true },
  { id: "sa_ministry_new", keyword: "伝道を楽しもう", section: "ministry", builtin: true },
  { id: "sa_living", keyword: "クリスチャンとして生活する", section: "living", builtin: true },
];

describe("sectionFromHeading", () => {
  it("既定の見出しを section に対応づける", () => {
    expect(sectionFromHeading("神の言葉の宝", ALIASES)).toBe("treasures");
    expect(sectionFromHeading("クリスチャンとして生活する", ALIASES)).toBe("living");
  });

  it("改称前後どちらの伝道セクション見出しも拾う", () => {
    expect(sectionFromHeading("野外奉仕に励む", ALIASES)).toBe("ministry");
    expect(sectionFromHeading("伝道を楽しもう", ALIASES)).toBe("ministry");
  });

  it("見出しでない行は undefined を返す", () => {
    expect(sectionFromHeading("開会の言葉（1分）", ALIASES)).toBeUndefined();
    expect(sectionFromHeading("", ALIASES)).toBeUndefined();
  });

  // 別名は利用者が追加できる。短い語を登録されるとプログラム行が見出しと
  // 誤認され、未分類にもならず黙って捨てられる。番号始まりの行を候補から
  // 外すことでこの経路を塞いでいる。
  it("part 番号で始まる行は、別名に一致しても見出しにしない", () => {
    const loose: SectionAlias[] = [
      ...ALIASES,
      { id: "sa_x", keyword: "伝道", section: "ministry", builtin: false },
    ];
    expect(sectionFromHeading("4. 会話を始める (3分) 家から家の伝道。", loose)).toBeUndefined();
    expect(sectionFromHeading("７．話 (5分) 日常生活の伝道。", loose)).toBeUndefined();
    // 見出しそのものは番号を持たないので従来どおり拾える
    expect(sectionFromHeading("伝道を楽しもう", loose)).toBe("ministry");
  });
});

describe("detectType", () => {
  const d = (c: string, e = "", section: Parameters<typeof detectType>[3] = null) =>
    detectType(c, e, defaultData(), section).typeId;

  it("会衆の必要は新旧どちらの名前でも local_needs になる", () => {
    expect(d("7. 会衆の必要 (15分)", "", "living")).toBe("local_needs");
    expect(d("7. 会衆で考えたいこと (15分)", "", "living")).toBe("local_needs");
  });

  it("part7 の一般的な討議は living_discussion のまま", () => {
    expect(d("7. エホバに貢献する大事な方法 (15分)", "", "living")).toBe("living_discussion");
  });

  it("part 番号で判別できる項目は名前が変わっても影響を受けない", () => {
    expect(d("1. どんな題でも (10分)", "", "treasures")).toBe("treasures_talk");
    expect(d("2. 宝石を探し出す (10分)", "", "treasures")).toBe("gems");
    expect(d("3. 聖書朗読 (4分)", "生徒：", "treasures")).toBe("bible_reading");
  });

  it("伝道セクションの実演と話を区別する", () => {
    expect(d("4. 会話を始める (3分) 家から家の伝道。", "生徒/相手：", "ministry")).toBe("ministry_demo");
    expect(d("6. 話 (5分)", "生徒/相手：", "ministry")).toBe("ministry_talk");
  });

  it("会衆聖書研究・祈り・開閉会の言葉を判定する", () => {
    expect(d("8. 会衆の聖書研究 (30分)", "司会/朗読：", "living")).toBe("cbs");
    expect(d("125", "祈り：")).toBe("prayer_close");
    expect(d("開会の言葉（1分）")).toBe("chairman");
  });

  it("判定できない行は未分類として返す", () => {
    const r = detectType("周南市徳山会衆", "", defaultData(), null);
    expect(r.auto).toBe(false);
  });
});

describe("プログラム名の呼び方マスタ（typeKeywords）", () => {
  it("呼び方を足せば、未知の改称でも同じ項目に落ちる", () => {
    const data = defaultData();
    // 将来「会衆で考えたいこと」がさらに改称された場合を模す
    expect(detectType("7. 会衆で話し合うこと (15分)", "", data, "living").typeId).toBe(
      "living_discussion"
    );

    data.typeKeywords.push({
      id: "tk_user",
      keyword: "会衆で話し合うこと",
      target: "local_needs",
      builtin: false,
    });
    expect(detectType("7. 会衆で話し合うこと (15分)", "", data, "living").typeId).toBe("local_needs");
  });

  it("既定の呼び方を消すと判定できなくなる（マスタが判定を駆動している証跡）", () => {
    const data = defaultData();
    data.typeKeywords = data.typeKeywords.filter((k) => k.target !== "local_needs");
    expect(detectType("7. 会衆で考えたいこと (15分)", "", data, "living").typeId).toBe(
      "living_discussion"
    );
  });
});
