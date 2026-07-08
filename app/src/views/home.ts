/** S1 ホーム（集会日一覧） — 要件定義 §7 S1 */
import type { Ctx } from "../ui/router";
import { sortedMeetings } from "../logic/meetings";
import { totalSlotCount } from "../logic/programs";
import { CIRCUIT_BADGE, STATUS_BADGE, esc, fmtDateFull } from "../ui/format";

export function homeView(el: HTMLElement, ctx: Ctx): void {
  const meetings = sortedMeetings(ctx.data);

  const rows = meetings
    .map((mt) => {
      const total = totalSlotCount(mt);
      const assigned = Object.keys(mt.assignments).length;
      return `<tr class="clickable" data-date="${mt.date}">
        <td>${fmtDateFull(mt.date)}</td>
        <td>${STATUS_BADGE[mt.status]}</td>
        <td>${assigned} / ${total} スロット</td>
        <td>${mt.circuit ? CIRCUIT_BADGE : ""} <span style="font-size:12px;color:var(--muted)">${esc(mt.srcFileName ?? "")}</span></td>
      </tr>`;
    })
    .join("");

  el.innerHTML = `
    <h1>ホーム（集会日一覧）</h1>
    <p class="page-desc">取り込み済みの集会日と割り当て状況の一覧。行をクリックすると割り当て画面を開きます。</p>
    <div class="toolbar">
      <a class="btn btn-primary" href="#/import-excel">＋ Excel を取り込む</a>
      <a class="btn" href="#/export">エクスポート</a>
    </div>
    ${
      meetings.length === 0
        ? `<div class="empty-state">
            <p>まだ集会プログラムがありません。</p>
            <p>初回セットアップ: ① <a href="#/members">成員を登録</a> →
              ② <a href="#/roles">ロールを付与</a> →
              ③ <a href="#/import-history">過去 PDF から履歴をインポート</a> →
              ④ <a href="#/import-excel">Excel を取り込み</a></p>
          </div>`
        : `<div class="table-wrap"><table>
            <thead><tr><th>開催日</th><th>状態</th><th>割当</th><th>備考</th></tr></thead>
            <tbody>${rows}</tbody>
          </table></div>`
    }`;

  el.querySelectorAll<HTMLElement>("tr[data-date]").forEach((tr) => {
    tr.onclick = () => ctx.goto(`assign?date=${tr.dataset.date}`);
  });
}
