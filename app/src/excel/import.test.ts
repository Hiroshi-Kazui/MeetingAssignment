/**
 * Excel 取り込みの end-to-end 回帰テスト。
 *
 * 実ワークブックは個人情報を含むためリポジトリに置けない。ここでは実物と
 * 同じ列配置（A列=集会日 / C列=項目名 / E列=担当ラベル）の合成ブックを
 * その場で組み立て、1週分が丸ごと正しく分類されることを固定する。
 */
import ExcelJS from "exceljs";
import { beforeAll, describe, expect, it } from "vitest";
import type { AppData } from "../models";
import { defaultData } from "../state";
import { parseWorkbook } from "./import";

// loadExcelJS() は window.ExcelJS を優先して見るため、Node 上ではこれを差し込む
beforeAll(() => {
  (globalThis as { window?: unknown }).window = { ExcelJS };
});

async function buildWorkbook(rows: Array<[unknown, string, string]>): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("10-30");
  for (const [a, c, e] of rows) {
    ws.addRow([a ?? null, null, c, null, e]);
  }
  const buf = await wb.xlsx.writeBuffer();
  return new Uint8Array(buf as ArrayBuffer);
}

/** 改称後の名前（伝道を楽しもう / 会衆で考えたいこと）で組み立てた1週分 */
const WEEK: Array<[unknown, string, string]> = [
  [null, "周南市徳山会衆", "週日の集会の予定"],
  [new Date(Date.UTC(2026, 9, 30)), "", "司会者："],
  [null, "125", "祈り："],
  [null, "開会の言葉（1分）", ""],
  [null, "神の言葉の宝", ""],
  [null, "1. エホバは，正しく憐れみ深い裁きを行う (10分)", ""],
  [null, "2. 宝石を探し出す (10分)", ""],
  [null, "3. 聖書朗読 (4分)", "生徒："],
  [null, "伝道を楽しもう", ""],
  [null, "4. 会話を始める (3分) 家から家の伝道。", "生徒/相手："],
  [null, "5. 再び話し合う (4分) 日常生活の会話。", "生徒/相手："],
  [null, "6. 話 (5分)", "生徒/相手："],
  [null, "クリスチャンとして生活する", ""],
  [null, "158", ""],
  [null, "7. 会衆で考えたいこと (15分)", ""],
  [null, "8. 会衆の聖書研究 (30分)", "司会/朗読："],
  [null, "閉会の言葉(3分)", ""],
  [null, "54", "祈り："],
];

describe("parseWorkbook", () => {
  let bytes: Uint8Array;
  let data: AppData;

  beforeAll(async () => {
    bytes = await buildWorkbook(WEEK);
    data = defaultData();
  });

  it("1週分を検出し、未分類が残らない", async () => {
    const drafts = await parseWorkbook(bytes, data);
    expect(drafts).toHaveLength(1);
    expect(drafts[0].date).toBe("2026-10-30");
    expect(drafts[0].rows.filter((r) => !r.auto)).toHaveLength(0);
  });

  it("改称後の名前でも各 part が正しい型に落ちる", async () => {
    const [draft] = await parseWorkbook(bytes, data);
    const byType = (id: string) => draft.rows.filter((r) => r.typeId === id).length;
    expect(byType("chairman")).toBe(1);
    expect(byType("treasures_talk")).toBe(1);
    expect(byType("gems")).toBe(1);
    expect(byType("bible_reading")).toBe(1);
    expect(byType("ministry_demo")).toBe(2);
    expect(byType("ministry_talk")).toBe(1);
    expect(byType("local_needs")).toBe(1);
    expect(byType("cbs")).toBe(1);
    expect(byType("prayer_open")).toBe(1);
    expect(byType("prayer_close")).toBe(1);
  });

  it("歌番号を開会・中間・閉会に振り分ける", async () => {
    const [draft] = await parseWorkbook(bytes, data);
    expect(draft.songs).toEqual({ open: 125, middle: 158, close: 54 });
  });

  it("セクション見出しの別名が無いと伝道セクションを見失う（マスタが効いている証跡）", async () => {
    const [draft] = await parseWorkbook(bytes, { ...data, sectionAliases: [] });
    expect(draft.rows.filter((r) => !r.auto).length).toBeGreaterThan(0);
    expect(draft.rows.filter((r) => r.typeId.startsWith("ministry_"))).toHaveLength(0);
  });

  // 利用者が短い別名を登録しても、プログラム行が見出しと誤認されて
  // 黙って消えないこと（未分類にもならないため行数で確かめる）
  it("短い別名を登録してもプログラム行が消えない", async () => {
    const base = await parseWorkbook(bytes, data);
    for (const keyword of ["伝道", "生活", "話", "宝"]) {
      const loose = {
        ...data,
        sectionAliases: [
          ...data.sectionAliases,
          { id: "sa_x", keyword, section: "ministry" as const, builtin: false },
        ],
      };
      const [draft] = await parseWorkbook(bytes, loose);
      expect(draft.rows, `別名「${keyword}」で行が消えた`).toHaveLength(base[0].rows.length);
      expect(draft.rows.filter((r) => r.typeId.startsWith("ministry_"))).toHaveLength(3);
    }
  });
});
