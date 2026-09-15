/**
 * 手動バックアップの形式と適用 — 要件定義 §3 / §7 S9
 *
 * バックアップは 2 種類ある。
 * - full        : AppData 全体。従来どおり復元で全置換する。
 * - assignments : マスタ（成員・ロール・呼び方など）を除いた割当のみ。
 *                 復元してもマスタは現在のものを保つ。
 *
 * 復元は 1 つのボタンでファイルを選ばせ、kind で自動的に使い分ける。
 * kind を持たない旧バックアップは full として読む（後方互換）。
 */
import type { AppData } from "./models";
import { migrate } from "./state";

/**
 * 割当側に属するフィールド。生成・検証・適用の 3 箇所でこの定義を共有し、
 * 将来フィールドが増えたときに片方だけ漏れるのを防ぐ。
 */
export const ASSIGNMENT_KEYS = ["meetings", "history", "pairHistory"] as const;

export type AssignmentKey = (typeof ASSIGNMENT_KEYS)[number];

export type BackupKind = "full" | "assignments";

export type FullBackup = AppData & { kind?: "full" };

export type AssignmentsBackup = {
  version: 1;
  kind: "assignments";
  savedAt: string;
} & Pick<AppData, AssignmentKey>;

export type AnyBackup = FullBackup | AssignmentsBackup;

export function buildFullBackup(d: AppData): FullBackup {
  return { ...d, kind: "full", savedAt: new Date().toISOString() };
}

export function buildAssignmentsBackup(d: AppData): AssignmentsBackup {
  const out = {
    version: 1,
    kind: "assignments",
    savedAt: new Date().toISOString(),
  } as AssignmentsBackup;
  for (const k of ASSIGNMENT_KEYS) (out[k] as unknown) = d[k] ?? [];
  return out;
}

export function backupKind(b: AnyBackup): BackupKind {
  return b.kind === "assignments" ? "assignments" : "full";
}

/**
 * バックアップ JSON を読み、種別を判定して形を検査する。
 * 不正なら理由を持つ Error を投げる（呼び出し側が alert に出す）。
 */
export function parseBackup(text: string): AnyBackup {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return fail("JSON として読み取れません");
  }
  if (typeof parsed !== "object" || parsed === null) return fail("バックアップ形式が不正です");
  const b = parsed as Record<string, unknown>;

  if (b.kind === "assignments") {
    // 割当のみ: 割当 3 配列が揃っていること。マスタは入っていなくてよい。
    for (const k of ASSIGNMENT_KEYS) {
      if (!Array.isArray(b[k])) return fail(`割当のみのバックアップに「${k}」がありません`);
    }
    return parsed as AssignmentsBackup;
  }

  // full（kind 欠落の旧バックアップを含む）: 従来と同じ検査。
  // migrate() は meetings / history を走査するため、配列であることまで確かめる
  // （壊れたバックアップで復元ボタンが無反応になるのを防ぐ）。
  if (
    b.version !== 1 ||
    !Array.isArray(b.members) ||
    !Array.isArray(b.meetings) ||
    !Array.isArray(b.history)
  ) {
    return fail("バックアップ形式が不正です");
  }
  return parsed as FullBackup;
}

/**
 * 現在のデータにバックアップを適用した結果を返す（current は変更しない）。
 * どちらの種別でも migrate() を通し、古いバックアップの既定値補充・
 * スキーマ移行が効くようにする。
 */
export function applyBackup(current: AppData, backup: AnyBackup): AppData {
  if (backupKind(backup) === "full") return migrate({ ...(backup as FullBackup) });
  // migrate() は成員などを直接書き換えるため、浅いコピーだと current 側の
  // オブジェクトまで巻き込む。割当のみ復元では current を残すので複製する。
  const merged = structuredClone(current);
  for (const k of ASSIGNMENT_KEYS) (merged[k] as unknown) = (backup as AssignmentsBackup)[k] ?? [];
  return migrate(merged);
}

/** 復元前の確認ダイアログに出す、種別と置換範囲の説明。 */
export function describeBackup(current: AppData, backup: AnyBackup): string {
  const b = backup as Partial<AppData>;
  const counts = `集会 ${b.meetings?.length ?? 0}回・履歴 ${b.history?.length ?? 0}件`;
  if (backupKind(backup) === "assignments") {
    return (
      `種別: 割当のみ（${counts}）\n\n` +
      `置き換わるのは割当スケジュールと割当データだけです（現在: 集会 ${current.meetings.length}回・履歴 ${current.history.length}件）。\n` +
      `成員・ロール・呼び方などのマスタは現在のまま残ります。\n\n` +
      `この操作は取り消せません。復元しますか？`
    );
  }
  return (
    `種別: 全データ（成員 ${b.members?.length ?? 0}名・${counts}）\n\n` +
    `現在のデータ（成員 ${current.members.length}名・集会 ${current.meetings.length}回・履歴 ${current.history.length}件）は、マスタを含めてすべて置き換わります。\n\n` +
    `この操作は取り消せません。復元しますか？`
  );
}

function fail(msg: string): never {
  throw new Error(msg);
}
