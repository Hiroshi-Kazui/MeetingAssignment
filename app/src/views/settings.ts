/** S9 バックアップ・設定 — 要件定義 §3 / §7 S9 */
import type { AppData } from "../models";
import type { Ctx } from "../ui/router";
import { isTauri, pickAndReadFiles, pickAndWriteFile } from "../platform";
import { esc, fmtDateTime } from "../ui/format";

export function settingsView(el: HTMLElement, ctx: Ctx): void {
  const d = ctx.data;

  function render(): void {
    const stats = `成員 ${d.members.length}名・集会 ${d.meetings.length}回・履歴 ${d.history.length}件`;
    el.innerHTML = `
      <h1>バックアップ・設定</h1>
      <p class="page-desc">データは自動で二重保存されています（アプリ内 + data.json）。ここでは手動バックアップの書き出しと復元ができます。</p>
      <h2>保存状態</h2>
      <div class="panel">
        <table style="border:none">
          <tr><td style="border:none; width:220px; color:var(--muted)">最終自動保存</td>
              <td style="border:none">${fmtDateTime(d.savedAt)}</td></tr>
          <tr><td style="border:none; color:var(--muted)">保存先</td>
              <td style="border:none">${isTauri ? "アプリ内 DB + 実行ファイルと同じフォルダの <code class='path'>data.json</code>" : "アプリ内 DB のみ（ブラウザ開発モード）"}</td></tr>
          <tr><td style="border:none; color:var(--muted)">現在のデータ</td>
              <td style="border:none">${stats}</td></tr>
          <tr><td style="border:none; color:var(--muted)">PC の引っ越し</td>
              <td style="border:none" class="page-desc">アプリのフォルダ（実行ファイル + data.json）をそのままコピーするだけで移行できます。</td></tr>
        </table>
      </div>
      <h2>手動バックアップ</h2>
      <div class="panel">
        <p style="margin-top:0; font-size:14px">成員・ロール・履歴・割り当てなど、すべてのデータを1つの JSON ファイルに書き出します。</p>
        <button class="btn btn-primary" id="backup">バックアップを書き出す</button>
        <span id="backup-done" style="margin-left:10px; font-size:14px; color:#1a7f37; display:none">✓ 書き出しました</span>
      </div>
      <h2>バックアップから復元</h2>
      <div class="panel">
        <p style="margin-top:0; font-size:14px">書き出した JSON ファイルを選んで、データ全体を置き換えます。</p>
        <div class="notice">⚠ 復元すると、<strong>現在のデータ（${stats}）はすべてバックアップの内容に置き換わります</strong>。この操作は取り消せません。</div>
        <button class="btn btn-danger" id="restore">バックアップファイルを選んで復元…</button>
      </div>`;
    bind();
  }

  function bind(): void {
    (el.querySelector("#backup") as HTMLButtonElement).onclick = async () => {
      const iso = new Date().toISOString().slice(0, 10);
      await pickAndWriteFile(
        { title: "バックアップの保存先", suggestedName: `backup_${iso}.json`, extensions: ["json"] },
        JSON.stringify(d, null, 2)
      );
      (el.querySelector("#backup-done") as HTMLElement).style.display = "";
    };

    (el.querySelector("#restore") as HTMLButtonElement).onclick = async () => {
      const files = await pickAndReadFiles({ title: "バックアップ JSON を選択", extensions: ["json"] });
      if (files.length === 0) return;
      let parsed: AppData;
      try {
        parsed = JSON.parse(new TextDecoder().decode(files[0].data)) as AppData;
        if (parsed.version !== 1 || !Array.isArray(parsed.members)) {
          throw new Error("バックアップ形式が不正です");
        }
      } catch (e) {
        alert(`復元できません: ${e}`);
        return;
      }
      if (
        !confirm(
          `選択したファイル: ${esc(files[0].name)}\n\n現在のデータ（${d.members.length}名・集会 ${d.meetings.length}回・履歴 ${d.history.length}件）は、このバックアップの内容にすべて置き換わります。この操作は取り消せません。\n\n復元しますか？`
        )
      )
        return;
      Object.assign(d, parsed);
      await ctx.persist();
      alert("復元しました。");
      ctx.refresh();
    };
  }

  render();
}
