/**
 * 集会の保存・ステータス計算（要件定義 §4.4 / §6-8）
 */
import type { AppData, Meeting, MeetingStatus } from "../models";
import { totalSlotCount } from "./programs";

export function calcStatus(meeting: Meeting): MeetingStatus {
  const total = totalSlotCount(meeting);
  const n = Object.keys(meeting.assignments).length;
  if (n === 0) return "none";
  if (n >= total) return "done";
  return "partial";
}

/**
 * 割り当てを保存し履歴へ確定する（§4.4）。
 * 保存済みの日の再保存では、その集会由来の履歴を取り消してから
 * 新しい割当で登録し直す（整合的上書き §6-8）。
 */
export function saveAssignments(
  data: AppData,
  meeting: Meeting,
  draft: Record<string, string>
): void {
  meeting.assignments = { ...draft };

  // この集会由来の履歴をいったん除去
  data.history = data.history.filter((h) => h.meetingId !== meeting.id);
  data.pairHistory = data.pairHistory.filter((p) => p.meetingId !== meeting.id);

  for (const prog of meeting.programs) {
    if (prog.noAssign) continue;
    let performerId: string | undefined;
    for (const slot of prog.slots) {
      if (prog.omitPartner && slot.kind === "partner") continue;
      const memberId = meeting.assignments[slot.key];
      if (!memberId) continue;
      data.history.push({
        memberId,
        roleId: slot.roleId,
        date: meeting.date,
        meetingId: meeting.id,
        slotKey: slot.key,
      });
      // 実演のペア履歴（演者×相手役 §5）
      if (slot.kind === "performer") performerId = memberId;
      if (slot.kind === "partner" && performerId) {
        data.pairHistory.push({
          performerId,
          partnerId: memberId,
          date: meeting.date,
          meetingId: meeting.id,
        });
      }
    }
  }

  meeting.status = calcStatus(meeting);
}

/** 日付順（昇順）の集会一覧 */
export function sortedMeetings(data: AppData): Meeting[] {
  return [...data.meetings].sort((a, b) => (a.date < b.date ? -1 : 1));
}
