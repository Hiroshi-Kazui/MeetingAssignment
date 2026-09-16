/**
 * 保存データの移行（migrate）の回帰テスト。
 * 既存データを壊さずに既定値を補えること、何度通しても結果が変わらないことを固定する。
 */
import { describe, expect, it } from "vitest";
import type { AppData } from "./models";
import { defaultData, migrate } from "./state";

/** 機能追加前の保存データ（sectionAliases を持たない）を模したもの */
function legacyData(): AppData {
  const d = defaultData();
  const withMeeting = {
    ...d,
    meetings: [
      {
        id: "mt_1",
        date: "2026-08-14",
        circuit: false,
        status: "none" as const,
        programs: [
          {
            key: "p0",
            typeId: "local_needs",
            name: "7. 会衆の必要 (15分)",
            section: "living" as const,
            noAssign: false,
            omitPartner: false,
            // 旧バージョンで焼き付いた表示名・ロール
            slots: [{ key: "p0-s0", roleId: "r_living", kind: "single" as const, label: "会衆の必要" }],
          },
        ],
        assignments: {},
      },
    ],
  };
  delete (withMeeting as Partial<AppData>).sectionAliases;
  return withMeeting as AppData;
}

describe("migrate", () => {
  it("sectionAliases が無い保存データに既定の別名を補う", () => {
    const m = migrate(legacyData());
    expect(m.sectionAliases.map((a) => a.keyword)).toEqual([
      "神の言葉の宝",
      "野外奉仕に励む",
      "伝道を楽しもう",
      "クリスチャンとして生活する",
    ]);
    expect(m.sectionAliases.every((a) => a.builtin)).toBe(true);
  });

  it("既存データ（集会）を落とさない", () => {
    const src = legacyData();
    const m = migrate(src);
    expect(m.meetings).toHaveLength(src.meetings.length);
    expect(m.meetings[0].date).toBe("2026-08-14");
  });

  // スロットの表示名は取り込み時に各集会へ焼き付くため、型定義側を改称しても
  // 既存データは旧名のまま残る。migrate が型ラベルから再同期する。
  it("焼き付いたスロット表示名を型ラベルへ再同期する", () => {
    const m = migrate(legacyData());
    const slot = m.meetings[0].programs[0].slots[0];
    expect(slot.label).toBe("会衆で考えたいこと");
    // local_needs の roleId を専用ロールへ付け替える既存の移行も併せて効く
    expect(slot.roleId).toBe("r_local_needs");
  });

  // 改称対応前に取り込んだ集会は part7 が討議のまま焼き付いており、
  // 「統治体の話」トグルが出ない（allowGbTalk は local_needs だけ）。
  it("改称後の名前で討議になっている part7 を local_needs へ付け替える", () => {
    const d = legacyData();
    const p = d.meetings[0].programs[0];
    p.typeId = "living_discussion";
    p.name = "7. 会衆で考えたいこと (15分)";
    p.slots = [{ key: "p0-s0", roleId: "r_living", kind: "single", label: "討議" }];
    d.meetings[0].assignments = { "p0-s0": "mb_1" };

    const m = migrate(d);
    const prog = m.meetings[0].programs[0];
    expect(prog.typeId).toBe("local_needs");
    expect(prog.slots[0].roleId).toBe("r_local_needs");
    expect(prog.slots[0].label).toBe("会衆で考えたいこと");
    // 割当済みの成員はスロットキーが変わらないので残る
    expect(m.meetings[0].assignments["p0-s0"]).toBe("mb_1");
  });

  it("旧名のままの討議（呼び方に一致しない）は付け替えない", () => {
    const d = legacyData();
    const p = d.meetings[0].programs[0];
    p.typeId = "living_discussion";
    p.name = "7. どうすれば親切になれますか (15分)";
    expect(migrate(d).meetings[0].programs[0].typeId).toBe("living_discussion");
  });

  // 取り込みレビューでの手動修正の記憶はキーワード判定より優先されるため、
  // 誤った記憶が残っていると再取り込みしても直らない。
  it("local_needs の呼び方を別型に覚えた typeRules を捨てる", () => {
    const d = legacyData();
    d.typeRules = [
      { signature: "会衆で考えたいこと", typeId: "living_discussion" },
      { signature: "会衆の必要", typeId: "local_needs" },
      { signature: "聖書朗読", typeId: "bible_reading" },
    ];
    const m = migrate(d);
    expect(m.typeRules.map((r) => r.signature)).toEqual(["会衆の必要", "聖書朗読"]);
  });

  it("利用者が追加した別名を保持し、欠けた既定分だけを補充する", () => {
    const m = migrate(legacyData());
    m.sectionAliases.push({ id: "sa_user", keyword: "宣教を楽しもう", section: "ministry", builtin: false });
    m.sectionAliases = m.sectionAliases.filter((a) => a.id !== "sa_ministry_new");

    const again = migrate(m);
    const keywords = again.sectionAliases.map((a) => a.keyword);
    expect(keywords).toContain("宣教を楽しもう");
    expect(keywords).toContain("伝道を楽しもう");
  });

  it("冪等（2回通しても結果が変わらない）", () => {
    const once = migrate(legacyData());
    const twice = migrate(JSON.parse(JSON.stringify(once)) as AppData);
    expect(twice).toEqual(once);
  });
});
