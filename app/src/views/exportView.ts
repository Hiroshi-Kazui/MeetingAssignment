/** S8 エクスポート（Excel 書き出し） — 要件定義 §4.5 / §7 S8 */
import type { Ctx } from "../ui/router";
import { pickAndReadFiles, pickAndWriteFile, type PickedFile } from "../platform";
import { exportWorkbook } from "../excel/export";
import { extractWorkbookDates } from "../excel/import";
import { sortedMeetings } from "../logic/meetings";
import { totalSlotCount } from "../logic/programs";
import { esc, fmtDate, fmtDateFull } from "../ui/format";

export function exportView(el: HTMLElement, ctx: Ctx): void {
  const d = ctx.data;
  let template: PickedFile | null = null; // 取り込み元と同じ期間の Excel を毎回選択する
  const checked = new Set<string>();
  /** テンプレートの A列から抽出した集会日。書き出し対象はここから自動判別する */
  let templateDates: string[] | null = null;
  /** テンプレートに載っているが取り込みデータが無い日（書き出し対象外の注意表示用） */
  let unknownDates: string[] = [];
  let donePath: string | null = null;
  let doneShown = false;

  function render(): void {
    // 一覧表示は新しい日付から（書き出し対象の抽出は sortedMeetings の昇順のまま使う）
    const meetings = [...sortedMeetings(d)].reverse();
    const dateChecks = meetings
      .map((mt) => {
        const assigned = Object.keys(mt.assignments).length;
        const total = totalSlotCount(mt);
        return `<label><input type="checkbox" value="${mt.date}" ${checked.has(mt.date) ? "checked" : ""}>
          ${fmtDateFull(mt.date)}（${assigned}/${total}）</label>`;
      })
      .join("");

    const incomplete = meetings.filter(
      (mt) => checked.has(mt.date) && Object.keys(mt.assignments).length < totalSlotCount(mt)
    );

    el.innerHTML = `
      <h1>エクスポート（Excel 書き出し）</h1>
      <p class="page-desc">割り当て済みの内容を、元の Excel（テンプレート）に名前入りで書き戻し、<strong>別のファイルとして</strong>保存します。元のファイルはそのまま残ります。</p>
      <div class="panel">
        <div class="field">
          <label>書き戻し先のテンプレート Excel（取り込み時と同じファイルを選択）</label>
          <button class="btn" id="pick">ファイルを選択…</button>
          <span style="margin-left:10px; font-size:14px; color:var(--muted)">${template ? `<code class="path">${esc(template.name)}</code>` : ""}</span>
        </div>
        <div class="field">
          <label>書き出す集会日（テンプレートの日付から自動選択されます。外したい日はチェックを外してください）</label>
          <div class="checks" id="dates">${dateChecks || '<span style="color:var(--muted)">取り込み済みの集会日がありません</span>'}</div>
        </div>
      </div>
      ${
        unknownDates.length
          ? `<div class="notice">⚠ テンプレートには次の日付がありますが、取り込み済みデータが無いため書き出されません: ${unknownDates
              .map(fmtDate)
              .join("、")}</div>`
          : ""
      }
      ${
        template && templateDates !== null && checked.size === 0
          ? `<div class="notice">⚠ テンプレートの日付（A列）と一致する取り込み済みの集会日がありません。取り込み時と同じ期間のファイルか確認してください。</div>`
          : ""
      }
      ${
        incomplete.length
          ? `<div class="notice">⚠ 次の集会日に未割当のスロットがあります（そのまま書き出すと該当欄は空欄になります）: ${incomplete
              .map((m) => `${fmtDate(m.date)}（${Object.keys(m.assignments).length}/${totalSlotCount(m)}）`)
              .join("、")}</div>`
          : ""
      }
      <div class="toolbar"><span class="spacer"></span>
        <button class="btn btn-primary" id="run" ${!template || checked.size === 0 ? "disabled" : ""}>書き出す</button></div>
      ${
        doneShown
          ? `<div class="panel notice-ok" style="border-color:#9fd6ae; background:#eefaf1">
              <strong>書き出しました。</strong><br>
              ${donePath ? `保存先: <code class="path">${esc(donePath)}</code><br>` : ""}
              <span style="font-size:13px; color:var(--muted)">名前は E列のラベルの後ろに敬称なしで追記され、2枠（生徒/相手）は「/」区切りです。ホームの該当日は「エクスポート済み」になります。</span>
            </div>`
          : ""
      }`;
    bind();
  }

  function bind(): void {
    (el.querySelector("#pick") as HTMLButtonElement).onclick = async () => {
      const files = await pickAndReadFiles({ title: "テンプレート Excel を選択", extensions: ["xlsx"] });
      if (files.length === 0) return;
      template = files[0];
      doneShown = false;
      // A列の日付から書き出し対象の週を自動判別する（チェックは手動で外せる）
      checked.clear();
      unknownDates = [];
      try {
        templateDates = await extractWorkbookDates(template.data);
        const known = new Set(sortedMeetings(d).map((m) => m.date));
        for (const dt of templateDates) {
          if (known.has(dt)) checked.add(dt);
          else unknownDates.push(dt);
        }
      } catch (e) {
        // 日付抽出に失敗しても従来どおり手動チェックで書き出せるようにする
        templateDates = null;
        console.error("テンプレートの日付抽出に失敗", e);
      }
      render();
    };
    el.querySelectorAll<HTMLInputElement>("#dates input").forEach((cb) => {
      cb.onchange = () => {
        if (cb.checked) checked.add(cb.value);
        else checked.delete(cb.value);
        doneShown = false;
        render();
      };
    });
    const run = el.querySelector<HTMLButtonElement>("#run");
    if (run)
      run.onclick = async () => {
        if (!template) return;
        const targets = sortedMeetings(d).filter((m) => checked.has(m.date));
        try {
          const { bytes, warnings } = await exportWorkbook(template.data, targets, d);
          if (warnings.length > 0) {
            if (!confirm(`警告があります:\n${warnings.map((w) => `${fmtDate(w.date)}: ${w.message}`).join("\n")}\n\nこのまま書き出しますか？`)) return;
          }
          const suggested = template.name.replace(/\.xlsx$/i, "") + "_割当済み.xlsx";
          donePath = await pickAndWriteFile(
            { title: "書き出し先を指定", suggestedName: suggested, extensions: ["xlsx"] },
            bytes
          );
          for (const mt of targets) mt.status = "exported";
          await ctx.persist();
          doneShown = true;
          render();
        } catch (e) {
          alert(`書き出しに失敗しました: ${e}`);
        }
      };
  }

  render();
}
