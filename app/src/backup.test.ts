/**
 * バックアップの区分け（全データ / 割当のみ）の回帰テスト。
 * 割当のみ復元でマスタが消えないこと、旧バックアップが従来どおり読めることを固定する。
 */
import { describe, expect, it } from "vitest";
import type { AppData, HistoryEntry, Meeting, Member, PairEntry } from "./models";

import { defaultData } from "./state";
import {
  applyBackup,
  ASSIGNMENT_KEYS,
  backupKind,
  buildAssignmentsBackup,
  buildFullBackup,
  parseBackup,
} from "./backup";

function meeting(id: string, date: string): Meeting {
  return { id, date, circuit: false, status: "none", programs: [], assignments: {} };
}

function member(id: string, name: string): Member {
  return { id, name, gender: "M", status: "active", roleIds: [], roleGroupIds: [] };
}

/** 成員・割当の両方が入った保存データ */
function sampleData(): AppData {
  const d = defaultData();
  return {
    ...d,
    members: [member("mb_1", "山田 太郎")],
    meetings: [meeting("mt_1", "2026-08-14")],
    history: [{ id: "h_1", memberId: "mb_1" } as unknown as HistoryEntry],
    pairHistory: [{ aId: "mb_1", bId: "mb_2" } as unknown as PairEntry],
  };
}

const roundTrip = (b: unknown) => parseBackup(JSON.stringify(b));

describe("buildAssignmentsBackup", () => {
  it("マスタ由来のキーを含めない", () => {
    const b = buildAssignmentsBackup(sampleData()) as unknown as Record<string, unknown>;
    for (const k of ["members", "roles", "roleGroups", "priorityGroups", "typeRules", "nameAliases", "sectionAliases", "typeKeywords"]) {
      expect(b).not.toHaveProperty(k);
    }
    expect(Object.keys(b).sort()).toEqual([...ASSIGNMENT_KEYS, "kind", "savedAt", "version"].sort());
  });

  it("割当 3 種をそのまま持ち出す", () => {
    const d = sampleData();
    const b = buildAssignmentsBackup(d);
    expect(b.meetings).toEqual(d.meetings);
    expect(b.history).toEqual(d.history);
    expect(b.pairHistory).toEqual(d.pairHistory);
  });
});

describe("parseBackup", () => {
  it("kind を持たない旧バックアップを全データとして読む", () => {
    const legacy = { ...sampleData() };
    delete (legacy as Partial<AppData> & { kind?: string }).kind;
    expect(backupKind(roundTrip(legacy))).toBe("full");
  });

  it("kind で全データ / 割当のみを見分ける", () => {
    expect(backupKind(roundTrip(buildFullBackup(sampleData())))).toBe("full");
    expect(backupKind(roundTrip(buildAssignmentsBackup(sampleData())))).toBe("assignments");
  });

  it("JSON として壊れていれば Error", () => {
    expect(() => parseBackup("{ こわれている")).toThrow();
  });

  it("全データなのに members が無ければ Error", () => {
    const broken = { ...sampleData(), members: undefined };
    expect(() => roundTrip(broken)).toThrow(/形式が不正/);
  });

  it("割当のみなのに pairHistory が無ければ Error", () => {
    const broken = { ...buildAssignmentsBackup(sampleData()), pairHistory: undefined };
    expect(() => roundTrip(broken)).toThrow(/pairHistory/);
  });
});

describe("applyBackup", () => {
  it("割当のみは割当だけを置き換え、マスタは現在のものを残す", () => {
    const current = sampleData();
    const other: AppData = {
      ...sampleData(),
      members: [member("mb_9", "別人")],
      meetings: [meeting("mt_9", "2026-09-11")],
      history: [],
      pairHistory: [],
    };
    const applied = applyBackup(current, roundTrip(buildAssignmentsBackup(other)));

    expect(applied.meetings.map((m) => m.id)).toEqual(["mt_9"]);
    expect(applied.history).toEqual([]);
    expect(applied.pairHistory).toEqual([]);
    // マスタは現在のまま
    expect(applied.members).toEqual(current.members);
    expect(applied.roles).toEqual(current.roles);
    expect(applied.sectionAliases).toEqual(current.sectionAliases);
  });

  it("全データはマスタを含めて置き換える", () => {
    const current = sampleData();
    const other: AppData = { ...sampleData(), members: [member("mb_9", "別人")] };
    const applied = applyBackup(current, roundTrip(buildFullBackup(other)));
    expect(applied.members.map((m) => m.id)).toEqual(["mb_9"]);
  });

  it("current を書き換えない", () => {
    const current = sampleData();
    const before = JSON.stringify(current);
    applyBackup(current, roundTrip(buildAssignmentsBackup({ ...sampleData(), meetings: [] })));
    expect(JSON.stringify(current)).toBe(before);
  });
});
