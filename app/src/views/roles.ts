/** S3 ロール／ロールグループ設定 — 要件定義 §4.2 / §7 S3 */
import type { Role, RoleGroup } from "../models";
import { byId, newId } from "../models";
import type { Ctx } from "../ui/router";
import { roleHolders } from "../logic/priority";
import { esc } from "../ui/format";

export function rolesView(el: HTMLElement, ctx: Ctx): void {
  const d = ctx.data;
  let editingRole: Role | null = null;
  let editingGroup: RoleGroup | null = null;

  function render(): void {
    const roleRows = d.roles
      .map((r) => {
        const holders = roleHolders(d, r.id).length;
        const pg =
          d.priorityGroups
            .filter((g) => g.roleIds.includes(r.id))
            .map((g) => g.name)
            .join("、") || "—";
        return `<tr>
          <td>${esc(r.name)}</td>
          <td>${esc(r.slotType)}</td>
          <td>${esc(pg)}</td>
          <td>${holders} 名</td>
          <td>
            <button class="btn btn-sm" data-edit-role="${r.id}">編集</button>
            <button class="btn btn-sm btn-danger" data-del-role="${r.id}">削除</button>
          </td>
        </tr>`;
      })
      .join("");

    const groupRows = d.roleGroups
      .map(
        (g) => `<tr>
          <td>${esc(g.name)}</td>
          <td style="font-size:13px">${g.roleIds.map((id) => esc(byId(d.roles, id)?.name ?? "?")).join("、")}</td>
          <td>
            <button class="btn btn-sm" data-edit-group="${g.id}">編集</button>
            <button class="btn btn-sm btn-danger" data-del-group="${g.id}">削除</button>
          </td>
        </tr>`
      )
      .join("");

    el.innerHTML = `
      <h1>ロール／ロールグループ設定</h1>
      <p class="page-desc">ロール = スロットを果たす資格（候補プールと履歴の単位）。ロールグループ = 成員へまとめて付与するための束。</p>
      <h2>ロール</h2>
      <div class="toolbar"><span class="spacer"></span>
        <button class="btn btn-primary" id="add-role">＋ ロールを追加</button></div>
      <div class="table-wrap"><table>
        <thead><tr><th>名称</th><th>種別</th><th>割当関連グループ</th><th>保持者数</th><th></th></tr></thead>
        <tbody>${roleRows}</tbody>
      </table></div>
      <h2>ロールグループ（成員への一括付与用）</h2>
      <div class="toolbar"><span class="spacer"></span>
        <button class="btn btn-primary" id="add-group">＋ ロールグループを追加</button></div>
      <div class="table-wrap"><table>
        <thead><tr><th>名称</th><th>内包ロール</th><th></th></tr></thead>
        <tbody>${groupRows}</tbody>
      </table></div>
      <dialog id="role-dialog">
        <h3 id="role-dlg-title"></h3>
        <div class="field"><label>名称</label><input type="text" id="r-name" style="width:100%"></div>
        <div class="field"><label>種別（表示用）</label><input type="text" id="r-type" placeholder="例: 話 / 生徒 / 司会"></div>
        <div class="dialog-actions">
          <button class="btn" id="r-cancel">キャンセル</button>
          <button class="btn btn-primary" id="r-save">保存</button>
        </div>
      </dialog>
      <dialog id="group-dialog">
        <h3 id="group-dlg-title"></h3>
        <div class="field"><label>名称</label><input type="text" id="g-name" style="width:100%" placeholder="例: 長老 / 生徒（兄弟）"></div>
        <div class="field"><label>内包ロール</label><div class="checks" id="g-roles"></div></div>
        <div class="dialog-actions">
          <button class="btn" id="g-cancel">キャンセル</button>
          <button class="btn btn-primary" id="g-save">保存</button>
        </div>
      </dialog>`;
    bind();
  }

  function bind(): void {
    (el.querySelector("#add-role") as HTMLButtonElement).onclick = () => openRole(null);
    (el.querySelector("#add-group") as HTMLButtonElement).onclick = () => openGroup(null);
    el.querySelectorAll<HTMLButtonElement>("[data-edit-role]").forEach((b) => {
      b.onclick = () => openRole(byId(d.roles, b.dataset.editRole!) ?? null);
    });
    el.querySelectorAll<HTMLButtonElement>("[data-del-role]").forEach((b) => {
      b.onclick = () => delRole(b.dataset.delRole!);
    });
    el.querySelectorAll<HTMLButtonElement>("[data-edit-group]").forEach((b) => {
      b.onclick = () => openGroup(byId(d.roleGroups, b.dataset.editGroup!) ?? null);
    });
    el.querySelectorAll<HTMLButtonElement>("[data-del-group]").forEach((b) => {
      b.onclick = () => delGroup(b.dataset.delGroup!);
    });
  }

  function delGroup(id: string): void {
    const g = byId(d.roleGroups, id);
    if (!g) return;
    const holders = d.members.filter((m) => m.roleGroupIds.includes(id));
    const msg =
      holders.length > 0
        ? `ロールグループ「${g.name}」を削除します。このグループを付与された成員 ${holders.length} 名からも外れます（各ロールは個別付与ぶんだけ残ります）。よろしいですか？`
        : `ロールグループ「${g.name}」を削除しますか？`;
    if (!confirm(msg)) return;
    // 成員の付与から取り除いてからグループ本体を削除する
    for (const m of holders) m.roleGroupIds = m.roleGroupIds.filter((gid) => gid !== id);
    d.roleGroups.splice(d.roleGroups.findIndex((rg) => rg.id === id), 1);
    void ctx.persist().then(render);
  }

  function delRole(id: string): void {
    const holders = roleHolders(d, id).length;
    const hasHistory = d.history.some((h) => h.roleId === id);
    const usedBySlot = d.meetings.some((m) => m.programs.some((p) => p.slots.some((s) => s.roleId === id)));
    if (holders > 0 || hasHistory || usedBySlot) {
      alert(
        `このロールは保持者 ${holders} 名・履歴${hasHistory ? "あり" : "なし"}・スロット使用${usedBySlot ? "あり" : "なし"}のため削除できません。\n先に成員から外すか、名称変更で対応してください。`
      );
      return;
    }
    if (!confirm("このロールを削除しますか？")) return;
    d.roles.splice(d.roles.findIndex((r) => r.id === id), 1);
    void ctx.persist().then(render);
  }

  function openRole(r: Role | null): void {
    editingRole = r;
    const dlg = el.querySelector<HTMLDialogElement>("#role-dialog")!;
    el.querySelector("#role-dlg-title")!.textContent = r ? `${r.name} を編集` : "ロールを追加";
    (el.querySelector("#r-name") as HTMLInputElement).value = r?.name ?? "";
    (el.querySelector("#r-type") as HTMLInputElement).value = r?.slotType ?? "";
    (el.querySelector("#r-cancel") as HTMLButtonElement).onclick = () => dlg.close();
    (el.querySelector("#r-save") as HTMLButtonElement).onclick = async () => {
      const name = (el.querySelector("#r-name") as HTMLInputElement).value.trim();
      if (!name) {
        alert("名称を入力してください");
        return;
      }
      const rec: Role = editingRole ?? { id: newId("r"), name: "", slotType: "—", priorityGroupId: null };
      rec.name = name;
      rec.slotType = (el.querySelector("#r-type") as HTMLInputElement).value.trim() || "—";
      if (!editingRole) d.roles.push(rec);
      await ctx.persist();
      dlg.close();
      render();
    };
    dlg.showModal();
  }

  function openGroup(g: RoleGroup | null): void {
    editingGroup = g;
    const dlg = el.querySelector<HTMLDialogElement>("#group-dialog")!;
    el.querySelector("#group-dlg-title")!.textContent = g ? `${g.name} を編集` : "ロールグループを追加";
    (el.querySelector("#g-name") as HTMLInputElement).value = g?.name ?? "";
    el.querySelector("#g-roles")!.innerHTML = d.roles
      .map(
        (r) =>
          `<label><input type="checkbox" value="${r.id}" ${g?.roleIds.includes(r.id) ? "checked" : ""}> ${esc(r.name)}</label>`
      )
      .join("");
    (el.querySelector("#g-cancel") as HTMLButtonElement).onclick = () => dlg.close();
    (el.querySelector("#g-save") as HTMLButtonElement).onclick = async () => {
      const name = (el.querySelector("#g-name") as HTMLInputElement).value.trim();
      if (!name) {
        alert("名称を入力してください");
        return;
      }
      const rec: RoleGroup = editingGroup ?? { id: newId("rg"), name: "", roleIds: [] };
      rec.name = name;
      rec.roleIds = [...el.querySelectorAll<HTMLInputElement>("#g-roles input:checked")].map((c) => c.value);
      if (!editingGroup) d.roleGroups.push(rec);
      await ctx.persist();
      dlg.close();
      render();
    };
    dlg.showModal();
  }

  render();
}
