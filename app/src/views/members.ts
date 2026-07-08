/** S2 成員マスター管理 — 要件定義 §4.1 / §7 S2 */
import type { Member } from "../models";
import { byId, newId } from "../models";
import type { Ctx } from "../ui/router";
import { memberRoleIds } from "../logic/priority";
import { esc } from "../ui/format";

export function membersView(el: HTMLElement, ctx: Ctx): void {
  const d = ctx.data;
  let editing: Member | null = null;
  const filter = { status: "active", roleId: "", q: "" };

  function render(): void {
    const list = d.members.filter(
      (m) =>
        (filter.status === "all" || m.status === filter.status) &&
        (!filter.roleId || memberRoleIds(d, m).includes(filter.roleId)) &&
        (!filter.q || m.name.includes(filter.q))
    );

    const rows =
      list
        .map((m) => {
          const roles = memberRoleIds(d, m)
            .map((id) => byId(d.roles, id)?.name)
            .filter(Boolean)
            .join("、");
          const groups = m.roleGroupIds
            .map((id) => `<span class="badge badge-blue">${esc(byId(d.roleGroups, id)?.name ?? "?")}</span>`)
            .join(" ");
          return `<tr class="${m.status === "inactive" ? "row-muted" : ""}">
            <td>${esc(m.name)}</td>
            <td>${m.gender === "M" ? "兄弟" : "姉妹"}</td>
            <td>${m.status === "active" ? '<span class="badge badge-green">在籍</span>' : '<span class="badge badge-gray">非活動・転出</span>'}</td>
            <td>${groups} <span style="font-size:13px;color:var(--muted)">${esc(roles)}</span></td>
            <td><button class="btn btn-sm" data-edit="${m.id}">編集</button></td>
          </tr>`;
        })
        .join("") ||
      `<tr><td colspan="5" style="color:var(--muted)">該当する成員がいません</td></tr>`;

    el.innerHTML = `
      <h1>成員マスター管理</h1>
      <p class="page-desc">成員は削除せず「状態」の変更で候補から外します（過去履歴は変わりません）。</p>
      <div class="toolbar">
        <div><label>状態</label>
          <select id="f-status">
            <option value="active" ${filter.status === "active" ? "selected" : ""}>在籍のみ</option>
            <option value="all" ${filter.status === "all" ? "selected" : ""}>すべて</option>
          </select></div>
        <div><label>ロール</label>
          <select id="f-role"><option value="">（すべて）</option>
            ${d.roles.map((r) => `<option value="${r.id}" ${filter.roleId === r.id ? "selected" : ""}>${esc(r.name)}</option>`).join("")}
          </select></div>
        <div><label>氏名検索</label>
          <input type="search" id="f-name" placeholder="部分一致" value="${esc(filter.q)}"></div>
        <span class="spacer"></span>
        <button class="btn" id="import-csv">CSV取り込み</button>
        <button class="btn btn-primary" id="add">＋ 成員を登録</button>
      </div>
      <div class="table-wrap"><table>
        <colgroup>
          <col style="width:18%">
          <col style="width:10%">
          <col style="width:12%">
          <col style="width:50%">
          <col style="width:10%">
        </colgroup>
        <thead><tr><th>氏名</th><th>性別</th><th>状態</th><th>保持ロール（グループ由来含む）</th><th></th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div>
      <dialog id="edit-dialog">
        <h3 id="dlg-title"></h3>
        <div class="field"><label>氏名（フルネーム）</label>
          <input type="text" id="e-name" style="width:100%" placeholder="例: 山田 健一"></div>
        <div class="field field-row">
          <div><label>性別</label>
            <select id="e-gender"><option value="M">兄弟</option><option value="F">姉妹</option></select></div>
          <div><label>状態</label>
            <select id="e-status"><option value="active">在籍</option><option value="inactive">非活動・転出</option></select></div>
        </div>
        <div class="field"><label>ロールグループ（一括付与 — 選ぶと内包ロールがまとめて有効になります）</label>
          <div class="checks" id="e-groups"></div></div>
        <div class="field"><label>個別ロール（グループに加えて個別に付与）</label>
          <div class="checks" id="e-roles"></div></div>
        <div class="dialog-actions">
          <button class="btn" id="e-cancel">キャンセル</button>
          <button class="btn btn-primary" id="e-save">保存</button>
        </div>
      </dialog>`;
    bind();
  }

  function bind(): void {
    (el.querySelector("#f-status") as HTMLSelectElement).onchange = (e) => {
      filter.status = (e.target as HTMLSelectElement).value;
      render();
    };
    (el.querySelector("#f-role") as HTMLSelectElement).onchange = (e) => {
      filter.roleId = (e.target as HTMLSelectElement).value;
      render();
    };
    (el.querySelector("#f-name") as HTMLInputElement).oninput = (e) => {
      filter.q = (e.target as HTMLInputElement).value.trim();
      render();
    };
    (el.querySelector("#import-csv") as HTMLButtonElement).onclick = () => ctx.goto("import-members");
    (el.querySelector("#add") as HTMLButtonElement).onclick = () => openEdit(null);
    el.querySelectorAll<HTMLButtonElement>("[data-edit]").forEach((b) => {
      b.onclick = () => openEdit(byId(d.members, b.dataset.edit!) ?? null);
    });
  }

  function openEdit(m: Member | null): void {
    editing = m;
    const dlg = el.querySelector<HTMLDialogElement>("#edit-dialog")!;
    el.querySelector("#dlg-title")!.textContent = m ? `${m.name} を編集` : "成員を登録";
    (el.querySelector("#e-name") as HTMLInputElement).value = m?.name ?? "";
    (el.querySelector("#e-gender") as HTMLSelectElement).value = m?.gender ?? "M";
    (el.querySelector("#e-status") as HTMLSelectElement).value = m?.status ?? "active";
    el.querySelector("#e-groups")!.innerHTML = d.roleGroups
      .map(
        (g) =>
          `<label><input type="checkbox" value="${g.id}" ${m?.roleGroupIds.includes(g.id) ? "checked" : ""}> ${esc(g.name)}</label>`
      )
      .join("");
    el.querySelector("#e-roles")!.innerHTML = d.roles
      .map(
        (r) =>
          `<label><input type="checkbox" value="${r.id}" ${m?.roleIds.includes(r.id) ? "checked" : ""}> ${esc(r.name)}</label>`
      )
      .join("");
    (el.querySelector("#e-cancel") as HTMLButtonElement).onclick = () => dlg.close();
    (el.querySelector("#e-save") as HTMLButtonElement).onclick = async () => {
      const name = (el.querySelector("#e-name") as HTMLInputElement).value.trim();
      if (!name) {
        alert("氏名を入力してください");
        return;
      }
      const rec: Member = editing ?? {
        id: newId("m"),
        name: "",
        gender: "M",
        status: "active",
        roleIds: [],
        roleGroupIds: [],
      };
      rec.name = name;
      rec.gender = (el.querySelector("#e-gender") as HTMLSelectElement).value as Member["gender"];
      rec.status = (el.querySelector("#e-status") as HTMLSelectElement).value as Member["status"];
      rec.roleGroupIds = [...el.querySelectorAll<HTMLInputElement>("#e-groups input:checked")].map((c) => c.value);
      rec.roleIds = [...el.querySelectorAll<HTMLInputElement>("#e-roles input:checked")].map((c) => c.value);
      if (!editing) d.members.push(rec);
      await ctx.persist();
      dlg.close();
      render();
    };
    dlg.showModal();
  }

  render();
}
