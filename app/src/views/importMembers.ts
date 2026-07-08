/** 成員CSV取り込み（氏名・性別のみ） */
import type { Ctx } from "../ui/router";
import { esc } from "../ui/format";
import { pickAndReadFiles } from "../platform";
import {
  decodeCsvBytes,
  importMemberCsvRows,
  parseMemberCsv,
  type MemberCsvRow,
} from "../csv/members";

export function importMembersView(el: HTMLElement, ctx: Ctx): void {
  let fileName = "";
  let rows: MemberCsvRow[] = [];
  let fileErrors: string[] = [];

  function render(): void {
    const invalidCount = rows.filter((r) => r.errors.length > 0).length;
    const createCount = rows.filter((r) => r.errors.length === 0 && !r.existingMemberId).length;
    const updateCount = rows.filter((r) => r.errors.length === 0 && r.existingMemberId).length;
    const rowsHtml = rows.length
      ? rows
          .map((r) => {
            const status =
              r.errors.length > 0
                ? `<span class="badge badge-red">${esc(r.errors.join("、"))}</span>`
                : r.existingMemberId
                  ? '<span class="badge badge-blue">既存を更新</span>'
                  : '<span class="badge badge-green">新規登録</span>';
            return `<tr class="${r.errors.length > 0 ? "row-warn" : ""}">
              <td>${r.rowNumber}</td>
              <td>${esc(r.name)}</td>
              <td>${esc(r.genderRaw)}${r.gender ? ` <span style="color:var(--muted)">(${r.gender === "M" ? "兄弟" : "姉妹"})</span>` : ""}</td>
              <td>在籍</td>
              <td>${status}</td>
            </tr>`;
          })
          .join("")
      : `<tr><td colspan="5" style="color:var(--muted)">CSVを選択すると、ここに取り込み内容を表示します</td></tr>`;

    const errorHtml = fileErrors.length
      ? `<div class="notice">${fileErrors.map(esc).join("<br>")}</div>`
      : "";

    el.innerHTML = `
      <h1>成員CSV取り込み</h1>
      <p class="page-desc">CSVから成員をまとめて登録します。必要な列は「氏名」と「性別」だけです。状態は取り込み時に在籍になります。</p>
      <div class="panel">
        <p style="margin-top:0">CSV形式: <code class="path">氏名,性別</code>。性別は <code class="path">兄弟</code> / <code class="path">姉妹</code>（<code class="path">男</code> / <code class="path">女</code> も可）で入力してください。</p>
        <button class="btn btn-primary" id="pick">CSVファイルを選択…</button>
        <span style="margin-left:10px; font-size:14px; color:var(--muted)">${fileName ? `<code class="path">${esc(fileName)}</code> を選択しました` : ""}</span>
      </div>
      ${errorHtml}
      ${
        rows.length
          ? `<div class="toolbar">
              <span class="badge badge-green">新規 ${createCount} 件</span>
              <span class="badge badge-blue">更新 ${updateCount} 件</span>
              ${invalidCount ? `<span class="badge badge-red">確認が必要 ${invalidCount} 件</span>` : ""}
            </div>`
          : ""
      }
      <div class="table-wrap"><table>
        <thead><tr><th>行</th><th>氏名</th><th>性別</th><th>状態</th><th>取り込み内容</th></tr></thead>
        <tbody>${rowsHtml}</tbody>
      </table></div>
      <div class="toolbar" style="margin-top:14px">
        <button class="btn" id="back">成員マスターへ戻る</button>
        <span class="spacer"></span>
        <button class="btn btn-primary" id="confirm" ${rows.length === 0 || fileErrors.length > 0 || invalidCount > 0 ? "disabled" : ""}>確定して取り込む</button>
      </div>`;
    bind();
  }

  function bind(): void {
    (el.querySelector("#pick") as HTMLButtonElement).onclick = async () => {
      const files = await pickAndReadFiles({
        title: "成員CSVを選択",
        extensions: ["csv"],
      });
      if (files.length === 0) return;

      fileName = files[0].name;
      try {
        const result = parseMemberCsv(decodeCsvBytes(files[0].data), ctx.data);
        rows = result.rows;
        fileErrors = result.errors;
      } catch (e) {
        rows = [];
        fileErrors = [`CSVの解析に失敗しました: ${e}`];
      }
      render();
    };

    (el.querySelector("#back") as HTMLButtonElement).onclick = () => ctx.goto("members");
    (el.querySelector("#confirm") as HTMLButtonElement).onclick = async () => {
      const result = importMemberCsvRows(ctx.data, rows);
      await ctx.persist();
      alert(`成員CSVを取り込みました。新規 ${result.created} 件、更新 ${result.updated} 件。`);
      ctx.goto("members");
    };
  }

  render();
}
