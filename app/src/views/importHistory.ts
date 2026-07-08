/** S6 履歴インポート（過去の記入済み PDF） — 要件定義 §4.7 / §7 S6 */
import { newId } from "../models";
import type { Ctx } from "../ui/router";
import { pickAndReadFiles } from "../platform";
import { extractHistoryFromPdf, type ExtractedEntry } from "../pdf/import";
import { esc, fmtDate } from "../ui/format";

export function importHistoryView(el: HTMLElement, ctx: Ctx): void {
  const d = ctx.data;
  let entries: ExtractedEntry[] = [];
  let fileNames: string[] = [];

  function render(): void {
    const pending = entries.filter((e) => e.matchedId === null).length;
    // 要確認を先頭に集約（§7 S6）
    const sorted = [...entries].sort(
      (a, b) => (a.matchedId === null ? -1 : 0) - (b.matchedId === null ? -1 : 0)
    );

    const memberOpts = (sel: string | null): string =>
      `<option value="">— 成員を選択 —</option>` +
      d.members
        .filter((m) => m.status === "active")
        .map((m) => `<option value="${m.id}" ${m.id === sel ? "selected" : ""}>${esc(m.name)}</option>`)
        .join("") +
      `<option value="__new__">＋ 新規成員として登録…</option>`;

    const rows = sorted
      .map((e) => {
        const i = entries.indexOf(e);
        if (e.matchedId) {
          const name = d.members.find((m) => m.id === e.matchedId)?.name ?? "?";
          return `<tr>
            <td>${fmtDate(e.date)}</td><td>${esc(e.progLabel)}</td><td>${esc(e.rawName)}</td>
            <td>${esc(name)}</td>
            <td><span class="badge badge-green">自動対応</span></td>
          </tr>`;
        }
        return `<tr class="row-warn">
          <td>${fmtDate(e.date)}</td><td>${esc(e.progLabel)}</td><td><strong>${esc(e.rawName)}</strong></td>
          <td><select data-i="${i}">${memberOpts(null)}</select></td>
          <td><span class="badge badge-amber">要確認</span></td>
        </tr>`;
      })
      .join("");

    el.innerHTML = `
      <h1>履歴インポート（過去の記入済み PDF）</h1>
      <p class="page-desc">導入時に、直近3か月ほどの記入済み PDF から担当実績を取り込みます。名前は自動で成員に対応づけられ、判断できなかったものだけ確認を求めます。</p>
      <div class="panel">
        <button class="btn btn-primary" id="pick">PDF ファイルを選択…（複数可）</button>
        <span style="margin-left:10px; font-size:14px; color:var(--muted)">${fileNames.map((f) => `<code class="path">${esc(f)}</code>`).join(", ")}</span>
      </div>
      ${
        entries.length === 0
          ? fileNames.length
            ? `<div class="notice">担当実績を抽出できませんでした。PDF がテキスト抽出可能か、レイアウトが集会プログラムと同一かをご確認ください。</div>`
            : ""
          : `
        ${pending > 0 ? `<div class="notice">${pending} 件の名前が自動で対応づけできませんでした。<span class="badge badge-amber">要確認</span> 行で対象の成員を選んでください。一度対応づけた名前は記憶されます。</div>` : ""}
        <h2>抽出結果のプレビュー（${entries.length} 件）</h2>
        <div class="table-wrap"><table>
          <thead><tr><th>集会日</th><th>プログラム</th><th>PDF 上の記載</th><th>対応づけ先の成員</th><th>状態</th></tr></thead>
          <tbody>${rows}</tbody>
        </table></div>
        <div class="toolbar" style="margin-top:14px"><span class="spacer"></span>
          <button class="btn btn-primary" id="confirm">確定して履歴に登録</button></div>`
      }`;
    bind();
  }

  function bind(): void {
    (el.querySelector("#pick") as HTMLButtonElement).onclick = async () => {
      const files = await pickAndReadFiles({
        title: "記入済み PDF を選択（複数可）",
        extensions: ["pdf"],
        multiple: true,
      });
      if (files.length === 0) return;
      fileNames = files.map((f) => f.name);
      entries = [];
      for (const f of files) {
        try {
          entries.push(...(await extractHistoryFromPdf(f.data, d)));
        } catch (e) {
          alert(`${f.name} の解析に失敗しました: ${e}`);
        }
      }
      render();
    };

    el.querySelectorAll<HTMLSelectElement>("select[data-i]").forEach((sel) => {
      sel.onchange = () => {
        const e = entries[Number(sel.dataset.i)];
        if (sel.value === "__new__") {
          const name = prompt("新規成員のフルネームを入力してください", e.rawName)?.trim();
          if (!name) {
            sel.value = "";
            return;
          }
          const gender = confirm("兄弟（男性）ですか？（キャンセル = 姉妹）") ? "M" : "F";
          const m = { id: newId("m"), name, gender: gender as "M" | "F", status: "active" as const, roleIds: [], roleGroupIds: [] };
          d.members.push(m);
          e.matchedId = m.id;
        } else {
          e.matchedId = sel.value || null;
        }
        if (e.matchedId) {
          // 表記→成員の対応を記憶し、同じ表記の他の行にも適用（§4.7）
          d.nameAliases = d.nameAliases.filter((a) => a.raw !== e.rawName);
          d.nameAliases.push({ raw: e.rawName, memberId: e.matchedId });
          for (const other of entries) {
            if (other.rawName === e.rawName && other.matchedId === null) other.matchedId = e.matchedId;
          }
        }
        render();
      };
    });

    const confirmBtn = el.querySelector<HTMLButtonElement>("#confirm");
    if (confirmBtn)
      confirmBtn.onclick = async () => {
        const remaining = entries.filter((e) => e.matchedId === null).length;
        if (remaining > 0 && !confirm(`要確認が ${remaining} 件残っています。未確認の行を除いて登録しますか？`)) return;

        const dates = [...new Set(entries.map((e) => e.date))];
        const dupDates = dates.filter((dt) => d.history.some((h) => h.date === dt && !h.meetingId));
        if (dupDates.length > 0) {
          if (!confirm(`取り込み済みと重複する集会日（${dupDates.map(fmtDate).join("、")}）の履歴を上書きします。よろしいですか？`)) return;
          d.history = d.history.filter((h) => h.meetingId || !dupDates.includes(h.date));
          d.pairHistory = d.pairHistory.filter((p) => p.meetingId || !dupDates.includes(p.date));
        }

        let count = 0;
        const pairMap = new Map<string, { performer?: string; partner?: string; date: string }>();
        for (const e of entries) {
          if (!e.matchedId) continue;
          d.history.push({ memberId: e.matchedId, roleId: e.roleId, date: e.date });
          count++;
          if (e.pairGroup) {
            const rec = pairMap.get(e.pairGroup) ?? { date: e.date };
            if (e.pairIndex === 0) rec.performer = e.matchedId;
            else rec.partner = e.matchedId;
            pairMap.set(e.pairGroup, rec);
          }
        }
        for (const rec of pairMap.values()) {
          if (rec.performer && rec.partner) {
            d.pairHistory.push({ performerId: rec.performer, partnerId: rec.partner, date: rec.date });
          }
        }
        await ctx.persist();
        alert(`${count} 件の担当実績を履歴に登録しました。今後の割り当て画面の並び順に反映されます。`);
        entries = [];
        fileNames = [];
        render();
      };
  }

  render();
}
