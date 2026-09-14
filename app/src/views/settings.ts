/** S9 バックアップ・設定 — 要件定義 §3 / §7 S9 */
import type { AppData, SectionAlias } from "../models";
import { newId } from "../models";
import type { Ctx } from "../ui/router";
import { isTauri, pickAndReadFiles, pickAndWriteFile } from "../platform";
import { SECTION_TITLE } from "../logic/programs";
import { migrate } from "../state";
import { esc, fmtDateTime } from "../ui/format";

const SECTION_OPTIONS = (Object.keys(SECTION_TITLE) as SectionAlias["section"][])
  .map((k) => `<option value="${k}">${SECTION_TITLE[k]}</option>`)
  .join("");

/** 見出し語の最低文字数。実際の見出しは6文字以上あり、短い語を許すと
 *  プログラム行を見出しと誤認して黙って捨ててしまうため（例「伝道」）。 */
const MIN_KEYWORD_LEN = 4;

export function settingsView(el: HTMLElement, ctx: Ctx): void {
  const d = ctx.data;

  function render(): void {
    const stats = `成員 ${d.members.length}名・集会 ${d.meetings.length}回・履歴 ${d.history.length}件`;
    const aliasRows = d.sectionAliases
      .map(
        (a) => `<tr>
            <td>${esc(a.keyword)}</td>
            <td>${SECTION_TITLE[a.section]}</td>
            <td>${a.builtin ? '<span class="badge badge-gray">既定</span>' : `<button class="btn btn-sm btn-danger" data-del="${a.id}">削除</button>`}</td>
          </tr>`
      )
      .join("");
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
      <h2>セクション見出しの別名</h2>
      <div class="panel">
        <p style="margin-top:0; font-size:14px">ワークブックはセクションの呼び方だけが変わることがあります（例:「野外奉仕に励む」→「伝道を楽しもう」）。取り込みでセクション配下の項目が未分類になったら、新しい呼び方をここに追加してください。アプリの更新は不要です。</p>
        <div class="table-wrap"><table>
          <thead><tr><th>見出しの語</th><th>セクション</th><th style="width:80px"></th></tr></thead>
          <tbody>${aliasRows}</tbody>
        </table></div>
        <div class="field-row" style="margin-top:12px; align-items:flex-end">
          <div class="field" style="margin-bottom:0"><label>見出しの語</label>
            <input type="text" id="alias-kw" placeholder="例: 伝道を楽しもう" style="width:260px"></div>
          <div class="field" style="margin-bottom:0"><label>セクション</label>
            <select id="alias-sec">${SECTION_OPTIONS}</select></div>
          <button class="btn btn-primary" id="alias-add">追加</button>
        </div>
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
    (el.querySelector("#alias-add") as HTMLButtonElement).onclick = async () => {
      const kw = (el.querySelector("#alias-kw") as HTMLInputElement).value.trim();
      const section = (el.querySelector("#alias-sec") as HTMLSelectElement)
        .value as SectionAlias["section"];
      if (!kw) return;
      if (kw.length < MIN_KEYWORD_LEN || /^\s*[0-9０-９]+[.．]/.test(kw)) {
        alert(
          `「${kw}」は見出しの語として短すぎるか、項目番号で始まっています。\n\n` +
            `短い語を登録すると、その語を含むプログラム行（例:「4. 会話を始める…家から家の伝道。」）が` +
            `見出しと間違えられて取り込みから外れます。ワークブックに書かれている見出しをそのまま入力してください。`
        );
        return;
      }
      // 部分一致で判定するため、既存の語と包含関係にある語は
      // 先に登録されている側が常に勝ち、後から足した側が無効になる
      const clash = d.sectionAliases.find(
        (a) => a.keyword === kw || a.keyword.includes(kw) || kw.includes(a.keyword)
      );
      if (clash) {
        alert(
          clash.keyword === kw
            ? `「${kw}」は既に登録されています。`
            : `「${kw}」は既に登録されている「${clash.keyword}」と重なるため追加できません。`
        );
        return;
      }
      d.sectionAliases.push({ id: newId("sa"), keyword: kw, section, builtin: false });
      await ctx.persist();
      render();
    };

    el.querySelectorAll<HTMLButtonElement>("[data-del]").forEach((btn) => {
      btn.onclick = async () => {
        const a = d.sectionAliases.find((x) => x.id === btn.dataset.del);
        if (!a || a.builtin) return;
        if (!confirm(`別名「${a.keyword}」を削除します。よろしいですか？`)) return;
        d.sectionAliases = d.sectionAliases.filter((x) => x.id !== a.id);
        await ctx.persist();
        render();
      };
    });

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
        // migrate() は meetings / history を走査するため、配列であることまで確かめる
        // （壊れたバックアップで復元ボタンが無反応になるのを防ぐ）
        if (
          parsed.version !== 1 ||
          !Array.isArray(parsed.members) ||
          !Array.isArray(parsed.meetings) ||
          !Array.isArray(parsed.history)
        ) {
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
      // 既定値の補充・スキーマ移行を通してから反映する（機能追加前の古い
      // バックアップでも既定の別名などが欠けないようにするため）
      try {
        Object.assign(d, migrate(parsed));
      } catch (e) {
        alert(`復元できません（データの移行に失敗しました）: ${e}`);
        return;
      }
      await ctx.persist();
      alert("復元しました。");
      ctx.refresh();
    };
  }

  render();
}
