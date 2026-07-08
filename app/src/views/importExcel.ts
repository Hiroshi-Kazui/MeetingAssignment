/** S5 Excel 取り込み（自動検出＋レビュー） — 要件定義 §4.3 / §7 S5 */
import type { Ctx } from "../ui/router";
import { pickAndReadFiles } from "../platform";
import { parseWorkbook, draftToMeeting, type MeetingDraft } from "../excel/import";
import { IGNORE_TYPE, TYPE_DEFS, normalizeSignature, typeDef } from "../logic/programs";
import { esc, fmtDateFull, CIRCUIT_BADGE } from "../ui/format";

export function importExcelView(el: HTMLElement, ctx: Ctx): void {
  const d = ctx.data;
  let drafts: MeetingDraft[] = [];
  let fileName = "";
  let step: 1 | 2 = 1;

  function render(): void {
    if (step === 1) renderStep1();
    else renderStep2();
  }

  function renderStep1(): void {
    const sheetList = drafts.length
      ? `<h2>検出された集会日</h2>
        <div class="table-wrap"><table>
          <thead><tr><th>シート</th><th>集会日</th><th>状態</th></tr></thead>
          <tbody>${drafts
            .map((dr) => {
              const dup = d.meetings.some((m) => m.date === dr.date);
              return `<tr class="${dup ? "row-warn" : ""}">
                <td>${esc(dr.sheet)}</td>
                <td>${fmtDateFull(dr.date)} ${dr.circuit ? CIRCUIT_BADGE : ""}</td>
                <td>${dup ? '<span class="badge badge-amber">取込済み — 確定すると上書き</span>' : '<span class="badge badge-green">新規</span>'}</td>
              </tr>`;
            })
            .join("")}</tbody>
        </table></div>
        <div class="toolbar" style="margin-top:14px"><span class="spacer"></span>
          <button class="btn btn-primary" id="to-step2">内容を確認する →</button></div>`
      : "";

    el.innerHTML = `
      <h1>Excel 取り込み（自動検出＋レビュー）</h1>
      <p class="page-desc">集会プログラムの Excel を読み込み、各行の種類を自動判定します。判定結果を確認・修正してから確定してください。修正内容は記憶され、次回から自動で適用されます。</p>
      <div class="wizard-steps">
        <span class="step current">① ファイル選択</span>
        <span class="step">② 内容の確認（レビュー）</span>
      </div>
      <div class="panel">
        <p style="margin-top:0">集会プログラムの Excel ファイル（.xlsx）を選択してください。1シートに2週分が入っている形式に対応しています。</p>
        <button class="btn btn-primary" id="pick">ファイルを選択…</button>
        <span id="picked" style="margin-left:10px; font-size:14px; color:var(--muted)">${fileName ? `<code class="path">${esc(fileName)}</code> を選択しました` : ""}</span>
      </div>
      ${sheetList}`;

    (el.querySelector("#pick") as HTMLButtonElement).onclick = async () => {
      const files = await pickAndReadFiles({ title: "集会プログラムの Excel を選択", extensions: ["xlsx"] });
      if (files.length === 0) return;
      fileName = files[0].name;
      try {
        drafts = await parseWorkbook(files[0].data, d.typeRules);
      } catch (e) {
        alert(`Excel の解析に失敗しました: ${e}`);
        return;
      }
      if (drafts.length === 0) {
        alert("集会日（日付行）を検出できませんでした。ファイル形式をご確認ください。");
      }
      render();
    };
    const next = el.querySelector<HTMLButtonElement>("#to-step2");
    if (next) next.onclick = () => { step = 2; render(); };
  }

  function renderStep2(): void {
    const typeOptions = (selected: string, auto: boolean): string => {
      const opts = TYPE_DEFS.map(
        (t) => `<option value="${t.id}" ${t.id === selected ? "selected" : ""}>${t.label}</option>`
      ).join("");
      const ignore = `<option value="${IGNORE_TYPE}" ${selected === IGNORE_TYPE && auto ? "selected" : ""}>（割当対象外・無視）</option>`;
      const unselected = !auto ? `<option value="" selected>— 選択 —</option>` : "";
      return unselected + opts + ignore;
    };

    const sections = drafts
      .map((dr, di) => {
        const rows = dr.rows
          .map((r, ri) => {
            const def = typeDef(r.typeId);
            const slotsDesc = def
              ? def.noAssign
                ? "なし（巡回監督が担当）"
                : def.slots.map((s) => s.label).join(" + ") + ` ${def.slots.length}枠`
              : "";
            const stateBadge = !r.auto
              ? '<span class="badge badge-amber">未分類 — 選択してください</span>'
              : def?.noAssign
              ? '<span class="badge badge-purple">割当対象外（巡回訪問週）</span>'
              : '<span class="badge badge-green">自動判定</span>';
            const omitCtl = def?.allowOmitPartner
              ? ` <label style="display:inline"><input type="checkbox" data-omit="${di}:${ri}" ${r.omitPartner ? "checked" : ""}> 相手役を省略（話の回）</label>`
              : "";
            return `<tr class="${!r.auto ? "row-warn" : ""}">
              <td style="font-size:13px">${esc(r.cText)}</td>
              <td><select data-type="${di}:${ri}">${typeOptions(r.typeId, r.auto)}</select></td>
              <td style="font-size:13px">${slotsDesc}${omitCtl}</td>
              <td>${stateBadge}</td>
            </tr>`;
          })
          .join("");
        return `<h2>${fmtDateFull(dr.date)} ${dr.circuit ? CIRCUIT_BADGE : ""}
            <input type="date" value="${dr.date}" data-date="${di}" style="margin-left:10px; font-size:13px"></h2>
          <div class="table-wrap"><table>
            <thead><tr><th>元の内容（C列）</th><th>種類（自動判定）</th><th>割り当て枠</th><th>状態</th></tr></thead>
            <tbody>${rows}</tbody>
          </table></div>`;
      })
      .join("");

    el.innerHTML = `
      <h1>Excel 取り込み（自動検出＋レビュー）</h1>
      <div class="wizard-steps">
        <span class="step">① ファイル選択</span>
        <span class="step current">② 内容の確認（レビュー）</span>
      </div>
      <div class="notice">黄色の行は自動判定できなかった「未分類」です。種類を選ぶか「（割当対象外・無視）」を選択してください。ここでの修正は記憶され、次回から自動で適用されます。</div>
      ${sections}
      <div class="toolbar" style="margin-top:14px">
        <button class="btn" id="back">← ファイル選択に戻る</button>
        <span class="spacer"></span>
        <button class="btn btn-primary" id="confirm">確定して取り込む</button>
      </div>`;

    (el.querySelector("#back") as HTMLButtonElement).onclick = () => { step = 1; render(); };

    el.querySelectorAll<HTMLSelectElement>("[data-type]").forEach((sel) => {
      sel.onchange = () => {
        const [di, ri] = sel.dataset.type!.split(":").map(Number);
        const row = drafts[di].rows[ri];
        row.typeId = sel.value || IGNORE_TYPE;
        row.auto = sel.value !== "";
        // 修正を型シグネチャ単位で記憶（§4.3）
        if (sel.value) {
          const sig = normalizeSignature(row.cText);
          if (sig) {
            d.typeRules = d.typeRules.filter((t) => t.signature !== sig);
            d.typeRules.push({ signature: sig, typeId: sel.value });
          }
        }
        render();
      };
    });
    el.querySelectorAll<HTMLInputElement>("[data-omit]").forEach((cb) => {
      cb.onchange = () => {
        const [di, ri] = cb.dataset.omit!.split(":").map(Number);
        drafts[di].rows[ri].omitPartner = cb.checked;
      };
    });
    el.querySelectorAll<HTMLInputElement>("[data-date]").forEach((inp) => {
      inp.onchange = () => {
        const di = Number(inp.dataset.date);
        if (inp.value) drafts[di].date = inp.value;
      };
    });

    (el.querySelector("#confirm") as HTMLButtonElement).onclick = async () => {
      const unclassified = drafts.flatMap((dr) => dr.rows.filter((r) => !r.auto));
      if (unclassified.length > 0) {
        if (!confirm(`未分類の行が ${unclassified.length} 件あります。無視して取り込みますか？`)) return;
      }
      const dupDates = drafts.map((dr) => dr.date).filter((dt) => d.meetings.some((m) => m.date === dt));
      if (dupDates.length > 0) {
        if (!confirm(`取り込み済みの集会日（${dupDates.join("、")}）を上書きします。よろしいですか？`)) return;
      }
      for (const dr of drafts) {
        const mt = draftToMeeting(dr, fileName);
        const idx = d.meetings.findIndex((m) => m.date === dr.date);
        if (idx >= 0) d.meetings.splice(idx, 1, mt);
        else d.meetings.push(mt);
      }
      await ctx.persist();
      alert(`${drafts.length} 件の集会日を取り込みました。`);
      ctx.goto("home");
    };
  }

  render();
}
