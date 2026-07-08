/**
 * 優先度計算（要件定義 §4.6 / §6）
 * mock/assets/common.js の検証済みロジックを TS 化したもの。
 * すべて AppData を引数に取る純関数（テスト可能・UI 非依存）。
 */
import type { AppData, Gender, Member } from "../models";
import { byId } from "../models";

/** 成員が保持する全ロール（個別付与＋ロールグループ経由） */
export function memberRoleIds(data: AppData, member: Member): string[] {
  const fromGroups = member.roleGroupIds.flatMap(
    (gid) => byId(data.roleGroups, gid)?.roleIds ?? []
  );
  return [...new Set([...member.roleIds, ...fromGroups])];
}

export function memberHasRole(data: AppData, member: Member, roleId: string): boolean {
  return memberRoleIds(data, member).includes(roleId);
}

export function roleHolders(data: AppData, roleId: string): Member[] {
  return data.members.filter((m) => memberHasRole(data, m, roleId));
}

/** 履歴の判定単位: 優先度グループに属すればグループ内全ロールを合算（重複所属可） */
export function historyRoleIds(data: AppData, roleId: string): string[] {
  const groupedRoleIds = data.priorityGroups
    .filter((g) => g.roleIds.includes(roleId))
    .flatMap((g) => g.roleIds);
  if (groupedRoleIds.length > 0) return [...new Set(groupedRoleIds)];

  // 旧データ互換: Role.priorityGroupId が残っている場合だけ参照する。
  const role = byId(data.roles, roleId);
  if (role?.priorityGroupId) {
    return byId(data.priorityGroups, role.priorityGroupId)?.roleIds ?? [roleId];
  }
  return [roleId];
}

export function lastAssignedDate(data: AppData, memberId: string, roleId: string): string | null {
  const rids = historyRoleIds(data, roleId);
  let last: string | null = null;
  for (const h of data.history) {
    if (h.memberId === memberId && rids.includes(h.roleId)) {
      if (last === null || h.date > last) last = h.date; // ISO 文字列は辞書順=日付順
    }
  }
  return last;
}

export function assignmentCount(data: AppData, memberId: string, roleId: string): number {
  const rids = historyRoleIds(data, roleId);
  return data.history.filter((h) => h.memberId === memberId && rids.includes(h.roleId)).length;
}

/** タイブレーク③のランダムを描画のたびに変えない固定ハッシュ（§4.6） */
function stableJitter(memberId: string, roleId: string): number {
  let h = 0;
  const s = memberId + roleId;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) & 0xffff;
  return h;
}

export interface Candidate {
  member: Member;
  last: string | null;
  count: number;
}

/**
 * スロット候補（§6-1,2）: 在籍かつロール保持者を
 * 未担当最優先 → 最終担当日が古い順 → 通算回数少 → 固定ランダム で返す。
 * gender 指定時はその性別のみ（S7「兄弟のみ」フィルタ）。
 */
export function candidatesFor(
  data: AppData,
  roleId: string,
  opts: { gender?: Gender | null } = {}
): Candidate[] {
  const { gender = null } = opts;
  return data.members
    .filter(
      (m) =>
        m.status === "active" &&
        memberHasRole(data, m, roleId) &&
        (!gender || m.gender === gender)
    )
    .map((m) => ({
      member: m,
      last: lastAssignedDate(data, m.id, roleId),
      count: assignmentCount(data, m.id, roleId),
    }))
    .sort((a, b) => {
      if ((a.last === null) !== (b.last === null)) return a.last === null ? -1 : 1;
      if (a.last !== b.last) return a.last! < b.last! ? -1 : 1;
      if (a.count !== b.count) return a.count - b.count;
      return stableJitter(a.member.id, roleId) - stableJitter(b.member.id, roleId);
    });
}

/** 演者×相手役のペア最終担当日（向きは問わない） */
export function pairLastDate(data: AppData, performerId: string, partnerId: string): string | null {
  let last: string | null = null;
  for (const p of data.pairHistory) {
    const hit =
      (p.performerId === performerId && p.partnerId === partnerId) ||
      (p.performerId === partnerId && p.partnerId === performerId);
    if (hit && (last === null || p.date > last)) last = p.date;
  }
  return last;
}

export interface PartnerCandidate {
  member: Member;
  pairLast: string | null;
  last: string | null;
}

/**
 * 相手役候補（§6-4,5）: 主キー=演者とのペア最終担当日（未ペア最優先）／
 * 副キー=相手役個人の最終担当日。既定は演者と同性のみ、showAll で異性も含める。
 */
export function partnerCandidatesFor(
  data: AppData,
  roleId: string,
  performerId: string,
  opts: { showAll?: boolean } = {}
): PartnerCandidate[] {
  const { showAll = false } = opts;
  const performer = byId(data.members, performerId);
  if (!performer) return [];
  return data.members
    .filter(
      (m) =>
        m.status === "active" &&
        m.id !== performerId &&
        memberHasRole(data, m, roleId) &&
        (showAll || m.gender === performer.gender)
    )
    .map((m) => ({
      member: m,
      pairLast: pairLastDate(data, performerId, m.id),
      last: lastAssignedDate(data, m.id, roleId),
    }))
    .sort((a, b) => {
      if ((a.pairLast === null) !== (b.pairLast === null)) return a.pairLast === null ? -1 : 1;
      if (a.pairLast !== b.pairLast) return a.pairLast! < b.pairLast! ? -1 : 1;
      if ((a.last === null) !== (b.last === null)) return a.last === null ? -1 : 1;
      if (a.last !== b.last) return a.last! < b.last! ? -1 : 1;
      return stableJitter(a.member.id, roleId) - stableJitter(b.member.id, roleId);
    });
}
