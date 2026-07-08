/** S4 割当関連グループ設定 — 要件定義 §4.2 / §7 S4 */
import type { PriorityGroup } from "../models";
import { byId, newId } from "../models";
import type { Ctx } from "../ui/router";
import { esc } from "../ui/format";

export function priorityGroupsView(el: HTMLElement, ctx: Ctx): void {
  const d = ctx.data;
  let editing: PriorityGroup | null = null;

  /** 旧データ互換用に、Role.priorityGroupId には最初に見つかった所属だけを残す */
  function syncRoles(): void {
    for (const r of d.roles) {
      r.priorityGroupId = d.priorityGroups.find((g) => g.roleIds.includes(r.id))?.id ?? null;
    }
  }

  function render(): void {
    const rows = d.priorityGroups
      .map(
        (g) => `<tr>
          <td>${esc(g.name)}</td>
          <td style="font-size:13px">${g.roleIds.map((id) => esc(byId(d.roles, id)?.name ?? "?")).join("、")}</td>
          <td>
            <button class="btn btn-sm" data-edit="${g.id}">編集</button>
            <button class="btn btn-sm btn-danger" data-del="${g.id}">削除</button>
          </td>
        </tr>`
      )
      .join("");

    const grouped = new Set(d.priorityGroups.flatMap((g) => g.roleIds));
    const ungrouped =
      d.roles.filter((r) => !grouped.has(r.id)).map((r) => esc(r.name)).join("、") || "（なし）";

    el.innerHTML = `
      <h1>割当関連グループ設定</h1>
      <p class="page-desc">複数のロールの履歴を<strong>合算</strong>して「前回いつ担当したか」を判定するための束です。例: 宝の話（part1）と宝石（part2）は同じ扱いにする。</p>
      <div class="notice">同じロールを複数の割当関連グループに入れられます。候補順では、そのロールを含む全グループの履歴を合算します。</div>
      <div class="toolbar"><span class="spacer"></span>
        <button class="btn btn-primary" id="add">＋ 割当関連グループを追加</button></div>
      <div class="table-wrap"><table>
        <thead><tr><th>名称</th><th>含まれるロール（履歴を合算）</th><th></th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div>
      <h2>グループに属さないロール（ロール単体で履歴判定）</h2>
      <div class="panel" style="font-size:14px">${ungrouped}</div>
      <dialog id="edit-dialog">
        <h3 id="dlg-title"></h3>
        <div class="field"><label>名称</label>
          <input type="text" id="e-name" style="width:100%" placeholder="例: 宝 part1 + part2"></div>
        <div class="field"><label>含めるロール</label><div class="checks" id="e-roles"></div></div>
        <div class="dialog-actions">
          <button class="btn" id="e-cancel">キャンセル</button>
          <button class="btn btn-primary" id="e-save">保存</button>
        </div>
      </dialog>`;
    bind();
  }

  function bind(): void {
    (el.querySelector("#add") as HTMLButtonElement).onclick = () => openEdit(null);
    el.querySelectorAll<HTMLButtonElement>("[data-edit]").forEach((b) => {
      b.onclick = () => openEdit(byId(d.priorityGroups, b.dataset.edit!) ?? null);
    });
    el.querySelectorAll<HTMLButtonElement>("[data-del]").forEach((b) => {
      b.onclick = () => {
        if (!confirm("このグループを削除しますか？（各ロールはロール単体の履歴判定に戻ります）")) return;
        d.priorityGroups.splice(d.priorityGroups.findIndex((g) => g.id === b.dataset.del), 1);
        syncRoles();
        void ctx.persist().then(render);
      };
    });
  }

  function openEdit(g: PriorityGroup | null): void {
    editing = g;
    const dlg = el.querySelector<HTMLDialogElement>("#edit-dialog")!;
    el.querySelector("#dlg-title")!.textContent = g ? `${g.name} を編集` : "割当関連グループを追加";
    (el.querySelector("#e-name") as HTMLInputElement).value = g?.name ?? "";
    el.querySelector("#e-roles")!.innerHTML = d.roles
      .map(
        (r) =>
          `<label><input type="checkbox" value="${r.id}" ${g?.roleIds.includes(r.id) ? "checked" : ""}> ${esc(r.name)}</label>`
      )
      .join("");
    (el.querySelector("#e-cancel") as HTMLButtonElement).onclick = () => dlg.close();
    (el.querySelector("#e-save") as HTMLButtonElement).onclick = async () => {
      const name = (el.querySelector("#e-name") as HTMLInputElement).value.trim();
      if (!name) {
        alert("名称を入力してください");
        return;
      }
      const checked = [...el.querySelectorAll<HTMLInputElement>("#e-roles input:checked")];
      const rec: PriorityGroup = editing ?? { id: newId("pg"), name: "", roleIds: [] };
      rec.name = name;
      rec.roleIds = checked.map((c) => c.value);
      if (!editing) d.priorityGroups.push(rec);
      syncRoles();
      await ctx.persist();
      dlg.close();
      render();
    };
    dlg.showModal();
  }

  render();
}
