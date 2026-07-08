/** 要件定義 §5 データモデル */

export type Gender = "M" | "F";
export type MemberStatus = "active" | "inactive";

export interface Member {
  id: string;
  name: string; // フルネーム
  gender: Gender;
  status: MemberStatus; // active=在籍 / inactive=非活動・転出
  roleIds: string[]; // 個別付与ロール
  roleGroupIds: string[]; // ロールグループ（一括付与）
}

export interface Role {
  id: string;
  name: string;
  slotType: string; // 表示用の種別（話/生徒/司会 など）
  priorityGroupId: string | null; // 旧データ互換用。実際の所属は PriorityGroup.roleIds を参照
}

export interface RoleGroup {
  id: string;
  name: string;
  roleIds: string[];
}

export interface PriorityGroup {
  id: string;
  name: string;
  roleIds: string[];
}

export type SlotKind = "single" | "performer" | "partner";

export interface Slot {
  key: string; // "p{i}-s{j}" 集会内で一意
  roleId: string;
  kind: SlotKind;
  label: string;
}

export type Section = "treasures" | "ministry" | "living" | null;

/** 集会内の1項目。Excel 取り込み時に確定し Meeting に保持される */
export interface Program {
  key: string; // "p{i}"
  typeId: string; // logic/programs.ts の TYPE_DEFS への参照
  name: string; // 表示名（Excel の C列由来）
  section: Section;
  noAssign: boolean; // 巡回監督担当など割当対象外
  omitPartner: boolean; // part6「話」の回: 相手役スロット省略
  slots: Slot[];
  /** エクスポート書き戻し先（取り込み元のシート名・行番号） */
  srcSheet?: string;
  srcRow?: number;
}

export type MeetingStatus = "none" | "partial" | "done" | "exported";

/** 歌の番号（開会・中間・閉会）。エクスポートのシート生成で使用（§4.5） */
export interface MeetingSongs {
  open?: number;
  middle?: number;
  close?: number;
}

export interface Meeting {
  id: string;
  date: string; // ISO YYYY-MM-DD
  circuit: boolean; // 巡回訪問週
  status: MeetingStatus;
  programs: Program[];
  assignments: Record<string, string>; // slotKey -> memberId（保存済み）
  srcFileName?: string; // 取り込み元ファイル名（参考表示用）
  scripture?: string; // 週の聖書範囲（例: "エレミヤ 31章"。日付行 D列由来）
  songs?: MeetingSongs;
}

/** 担当履歴（保存済み割当＋PDF インポート由来） */
export interface HistoryEntry {
  memberId: string;
  roleId: string;
  date: string; // ISO
  meetingId?: string; // アプリ内の集会由来なら設定（再保存時の整合上書きに使用）
  slotKey?: string;
}

/** ペア履歴（実演の 演者×相手役） */
export interface PairEntry {
  performerId: string;
  partnerId: string;
  date: string; // ISO
  meetingId?: string;
}

/** S5: レビュー修正の記憶（型シグネチャ → 型） */
export interface TypeRule {
  signature: string; // 正規化した C列テキスト
  typeId: string; // "__ignore__" = 無視
}

/** S6: 名寄せの記憶（PDF 上の表記 → 成員） */
export interface NameAlias {
  raw: string; // 正規化前の表記
  memberId: string;
}

export interface AppData {
  version: 1;
  savedAt: string; // ISO datetime
  members: Member[];
  roles: Role[];
  roleGroups: RoleGroup[];
  priorityGroups: PriorityGroup[];
  meetings: Meeting[];
  history: HistoryEntry[];
  pairHistory: PairEntry[];
  typeRules: TypeRule[];
  nameAliases: NameAlias[];
}

export const byId = <T extends { id: string }>(arr: T[], id: string): T | undefined =>
  arr.find((x) => x.id === id);

export const newId = (prefix: string): string =>
  `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
