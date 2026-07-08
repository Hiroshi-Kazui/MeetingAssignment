/** 表示整形ヘルパー（mock/common.js 由来） */
import type { MeetingStatus } from "../models";

/** HTML エスケープ（成員名など可変文字列は必ず通す） */
export function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** ISO → "M/D"。null は「未」 */
export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "未";
  const [, m, d] = iso.split("-");
  return `${Number(m)}/${Number(d)}`;
}

/** ISO → "YYYY年M月D日（曜）" */
export function fmtDateFull(iso: string): string {
  const [y, m, d] = iso.split("-");
  const dt = new Date(Number(y), Number(m) - 1, Number(d));
  const w = "日月火水木金土"[dt.getDay()];
  return `${y}年${Number(m)}月${Number(d)}日（${w}）`;
}

/** ISO datetime → "YYYY年M月D日 HH:mm" */
export function fmtDateTime(iso: string): string {
  if (!iso) return "—";
  const dt = new Date(iso);
  return `${dt.getFullYear()}年${dt.getMonth() + 1}月${dt.getDate()}日 ${String(dt.getHours()).padStart(2, "0")}:${String(dt.getMinutes()).padStart(2, "0")}`;
}

export const STATUS_BADGE: Record<MeetingStatus, string> = {
  none: '<span class="badge badge-gray">未割当</span>',
  partial: '<span class="badge badge-amber">一部割当</span>',
  done: '<span class="badge badge-green">割当済み</span>',
  exported: '<span class="badge badge-blue">エクスポート済み</span>',
};

export const CIRCUIT_BADGE = '<span class="badge badge-purple">巡回訪問週</span>';
