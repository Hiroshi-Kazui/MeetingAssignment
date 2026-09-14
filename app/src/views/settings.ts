/** S9 バックアップ・設定 — 要件定義 §3 / §7 S9 */
import type { AppData, SectionAlias } from "../models";
import { newId } from "../models";
import type { Ctx } from "../ui/router";
import { isTauri, pickAndReadFiles, pickAndWriteFile } from "../platform";
import { KEYWORD_TARGETS, SECTION_GROUP } from "../logic/programs";
import { migrate } from "../state";
import { esc, fmtDateTime } from "../ui/format";

type SectionId = SectionAlias["section"];

const SECTION_IDS = Object.keys(SECTION_GROUP) as SectionId[];
const TARGET_IDS = Object.keys(KEYWORD_TARGETS) as Array<keyof typeof KEYWORD_TARGETS>;

/**
 * 呼び方の最低文字数。短い語を許すと、その語を含むプログラム行が
 * 見出しや別の項目と誤認される（例「伝道」で part4 の行が消える）。
 * 既定分はコード側で与えるためこの検査を通らない語（「宝石」等）も含む。
 */
const MIN_KEYWORD_LEN = { section: 4, type: 3 } as const;

export function settingsView(el: HTMLElement, ctx: Ctx): void {
  const d = ctx.data;

  /** 呼び方を1つの chip として描く。既定分は削除ボタンを出さない */
  const chip = (id: string, keyword: string, builtin: boolean, kind: "sec" | "type"): string =>
    `<span class="alias-chip${builtin ? " is-builtin" : ""}">${esc(keyword)}${
      builtin ? "" : `<button type="button" class="alias-del" data-del="${kind}:${id}" title="削除">×</button>`
    }</span>`;

  function render(): void {
    const stats = `成員 ${d.members.length}名・集会 ${d.meetings.length}回・履歴 ${d.history.length}件`;

    // 「区分（part番号）」1行に、その区分の呼び方をすべて並べる。
    // 呼び方とセクション名を別の列に並べると同じ語が二重に見えて紛らわしいため。
    const sectionRows = SECTION_IDS.map((sec) => {
      const chips = d.sectionAliases
        .filter((a) => a.section === sec)
        .map((a) => chip(a.id, a.keyword, a.builtin, "sec"))
        .join("");
      return `<tr><td style="width:190px">${SECTION_GROUP[sec]}</td><td>${chips}</td></tr>`;
    }).join("");

    const typeRows = TARGET_IDS.map((t) => {
      const chips = d.typeKeywords
        .filter((k) => k.target === t)
        .map((k) => chip(k.id, k.keyword, k.builtin, "type"))
        .join("");
      return `<tr><td style="width:230px">${KEYWORD_TARGETS[t]}</td><td>${chips}</td></tr>`;
    }).join("");

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

      <h2>ワークブックの呼び方</h2>
      <p class="page-desc">ワークブックは中身が同じまま呼び方だけ変わることがあります（例:「野外奉仕に励む」→「伝道を楽しもう」、「会衆の必要」→「会衆で考えたいこと」）。取り込みでうまく判定されなくなったら、新しい呼び方をここに足してください。アプリの更新は不要です。</p>

      <div class="panel">
        <h3 style="margin-top:0">セクションの見出し</h3>
        <div class="table-wrap"><table>
          <thead><tr><th>区分</th><th>ワークブック上の呼び方</th></tr></thead>
          <tbody>${sectionRows}</tbody>
        </table></div>
        <div class="field-row" style="margin-top:12px; align-items:flex-end">
          <div class="field" style="margin-bottom:0"><label>区分</label>
            <select id="sec-target">${SECTION_IDS.map((s) => `<option value="${s}">${SECTION_GROUP[s]}</option>`).join("")}</select></div>
          <div class="field" style="margin-bottom:0"><label>新しい呼び方</label>
            <input type="text" id="sec-kw" placeholder="例: 伝道を楽しもう" style="width:260px"></div>
          <button class="btn btn-primary" id="sec-add">追加</button>
        </div>
      </div>

      <div class="panel">
        <h3 style="margin-top:0">プログラムの項目名</h3>
        <div class="table-wrap"><table>
          <thead><tr><th>項目</th><th>ワークブック上の呼び方</th></tr></thead>
          <tbody>${typeRows}</tbody>
        </table></div>
        <div class="field-row" style="margin-top:12px; align-items:flex-end">
          <div class="field" style="margin-bottom:0"><label>項目</label>
            <select id="type-target">${TARGET_IDS.map((t) => `<option value="${t}">${KEYWORD_TARGETS[t]}</option>`).join("")}</select></div>
          <div class="field" style="margin-bottom:0"><label>新しい呼び方</label>
            <input type="text" id="type-kw" placeholder="例: 会衆で考えたいこと" style="width:260px"></div>
          <button class="btn btn-primary" id="type-add">追加</button>
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

  /**
   * 追加してよい呼び方か検査する。NG ならその理由を返す。
   * 判定は部分一致なので、短すぎる語と既存語との包含は弾く
   * （包含する側が常に先に勝ち、足した側が永久に効かなくなるため）。
   */
  function rejectReason(kw: string, min: number, existing: string[]): string | null {
    if (kw.length < min || /^\s*[0-9０-９]+[.．]/.test(kw)) {
      return `「${kw}」は呼び方として短すぎるか、項目番号で始まっています。\n\n短い語を登録すると、その語を含む別の行まで巻き込んで取り込みが崩れます。ワークブックに書かれている呼び方をそのまま入力してください。`;
    }
    const clash = existing.find((e) => e === kw || e.includes(kw) || kw.includes(e));
    if (clash) {
      return clash === kw
        ? `「${kw}」は既に登録されています。`
        : `「${kw}」は既に登録されている「${clash}」と重なるため追加できません。`;
    }
    return null;
  }

  function bind(): void {
    (el.querySelector("#sec-add") as HTMLButtonElement).onclick = async () => {
      const kw = (el.querySelector("#sec-kw") as HTMLInputElement).value.trim();
      const section = (el.querySelector("#sec-target") as HTMLSelectElement).value as SectionId;
      if (!kw) return;
      const ng = rejectReason(kw, MIN_KEYWORD_LEN.section, d.sectionAliases.map((a) => a.keyword));
      if (ng) return void alert(ng);
      d.sectionAliases.push({ id: newId("sa"), keyword: kw, section, builtin: false });
      await ctx.persist();
      render();
    };

    (el.querySelector("#type-add") as HTMLButtonElement).onclick = async () => {
      const kw = (el.querySelector("#type-kw") as HTMLInputElement).value.trim();
      const target = (el.querySelector("#type-target") as HTMLSelectElement).value;
      if (!kw) return;
      const ng = rejectReason(kw, MIN_KEYWORD_LEN.type, d.typeKeywords.map((k) => k.keyword));
      if (ng) return void alert(ng);
      d.typeKeywords.push({ id: newId("tk"), keyword: kw, target, builtin: false });
      await ctx.persist();
      render();
    };

    el.querySelectorAll<HTMLButtonElement>("[data-del]").forEach((btn) => {
      btn.onclick = async () => {
        const [kind, id] = btn.dataset.del!.split(":");
        const item =
          kind === "sec"
            ? d.sectionAliases.find((x) => x.id === id)
            : d.typeKeywords.find((x) => x.id === id);
        if (!item || item.builtin) return;
        if (!confirm(`呼び方「${item.keyword}」を削除します。よろしいですか？`)) return;
        if (kind === "sec") d.sectionAliases = d.sectionAliases.filter((x) => x.id !== id);
        else d.typeKeywords = d.typeKeywords.filter((x) => x.id !== id);
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
      // バックアップでも既定の呼び方などが欠けないようにするため）
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
