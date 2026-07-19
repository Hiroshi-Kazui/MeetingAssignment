/** S7 割り当て（1画面=1集会日） — 要件定義 §4.4 / §4.6 / §7 S7 */
import type { Meeting, Slot } from "../models";
import { byId } from "../models";
import type { Ctx } from "../ui/router";
import { candidatesFor, partnerCandidatesFor } from "../logic/priority";
import { calcStatus, saveAssignments, sortedMeetings } from "../logic/meetings";
import { setCircuit, totalSlotCount } from "../logic/programs";
import { CIRCUIT_BADGE, STATUS_BADGE, esc, fmtDate, fmtDateFull } from "../ui/format";

const SECTION_TITLES: Record<string, string> = {
  treasures: "神の言葉の宝",
  ministry: "野外奉仕に励む",
  living: "クリスチャンとして生活する",
};

export function assignView(el: HTMLElement, ctx: Ctx, params: URLSearchParams): void {
  const meetings = sortedMeetings(ctx.data);
  if (meetings.length === 0) {
    el.innerHTML = `<h1>割り当て</h1>
      <div class="empty-state"><p>集会プログラムがまだありません。先に <a href="#/import-excel">Excel を取り込んで</a>ください。</p></div>`;
    return;
  }
  const meeting: Meeting =
    meetings.find((m) => m.date === params.get("date")) ??
    meetings.find((m) => m.status === "none" || m.status === "partial") ??
    meetings[0];

  // 画面上の選択状態（保存までは履歴・優先度に反映しない §4.4）
  let draft: Record<string, string> = { ...meeting.assignments };
  let dirty = false;
  const brothersOnly: Record<string, boolean> = {};
  const showAll: Record<string, boolean> = {};
  // 野外奉仕の「話」は既定で「兄弟のみ」オン（§4.6）
  for (const p of meeting.programs) {
    if (p.section === "ministry" && (p.omitPartner || p.typeId === "ministry_talk")) {
      const perf = p.slots.find((s) => s.kind === "performer");
      if (perf) brothersOnly[perf.key] = true;
    }
  }

  ctx.setDirtyGuard(() => dirty);
  const memberName = (id: string) => byId(ctx.data.members, id)?.name ?? "?";

  function optionsFor(prog: Meeting["programs"][number], slot: Slot): string | null {
    const currentVal = draft[slot.key];
    let list: { id: string; text: string }[];
    if (slot.kind === "partner") {
      const perfKey = prog.slots.find((s) => s.kind === "performer")?.key ?? "";
      const performerId = draft[perfKey];
      if (!performerId) return null; // 演者未選択 → 無効
      list = partnerCandidatesFor(ctx.data, slot.roleId, performerId, {
        showAll: showAll[slot.key],
      }).map((c) => ({
        id: c.member.id,
        text: `${c.member.name}（ペア:${fmtDate(c.pairLast)}・個人:${fmtDate(c.last)}）`,
      }));
    } else {
      list = candidatesFor(ctx.data, slot.roleId, {
        gender: brothersOnly[slot.key] ? "M" : null,
      }).map((c) => ({
        id: c.member.id,
        text: `${c.member.name}（${fmtDate(c.last)}）`,
      }));
    }
    // この画面で既に選ばれている成員（保存前の draft を含む）は最下位へ送る（§4.6）。
    // 履歴日付ベースだと過去日の集会で効かないため、明示的に並び替える
    const chosen = new Set(
      Object.entries(draft)
        .filter(([k]) => k !== slot.key)
        .map(([, v]) => v)
    );
    list = [
      ...list.filter((o) => !chosen.has(o.id)),
      ...list
        .filter((o) => chosen.has(o.id))
        .map((o) => ({ ...o, text: o.text.replace(/）$/, "・選択済み）") })),
    ];
    // 絞り込みで候補から外れても選択済みの成員は黙って消さない
    if (currentVal && !list.some((o) => o.id === currentVal)) {
      list.push({ id: currentVal, text: `${memberName(currentVal)}（絞り込み対象外）` });
    }
    return (
      `<option value="">— 未割当 —</option>` +
      list
        .map(
          (o) =>
            `<option value="${o.id}" ${o.id === currentVal ? "selected" : ""}>${esc(o.text)}</option>`
        )
        .join("")
    );
  }

  function render(): void {
    const idx = meetings.indexOf(meeting);
    let listHtml = "";
    let lastSection: string | null | undefined;
    for (const p of meeting.programs) {
      if (p.section !== lastSection && p.section) {
        listHtml += `<div class="section-label sec-${p.section}">${SECTION_TITLES[p.section]}</div>`;
      }
      lastSection = p.section;

      if (p.noAssign) {
        listHtml += `<div class="slot-row disabled">
          <div><div class="prog-name">${esc(p.name)}</div><div class="slot-kind">巡回監督が担当（割当対象外）</div></div>
          <div></div><div></div></div>`;
        continue;
      }

      const canTalk = p.typeId === "demo6";
      const canGbTalk = p.typeId === "local_needs";
      const gbTalkCtl = canGbTalk
        ? `<div class="partner-opts"><label style="margin:0"><input type="checkbox" data-gbtalk="${p.key}" ${p.gbTalk ? "checked" : ""}> 統治体の話（動画のみ・司会なし）</label></div>`
        : "";
      const cells = p.slots.map((s) => {
        const isPartner = s.kind === "partner";
        if (isPartner && p.omitPartner) {
          const reason =
            p.typeId === "ministry_demo" ? "（兄弟のみのため相手なし）" : "（話の回のため省略）";
          return `<div><div class="slot-kind">${esc(s.label)}</div>
            <select disabled><option>${reason}</option></select></div>`;
        }
        if (p.gbTalk) {
          return `<div><div class="slot-kind">${esc(s.label)}</div>
            <select disabled><option>（統治体の話・司会なし）</option></select>
            ${gbTalkCtl}</div>`;
        }
        const opts = optionsFor(p, s);
        const disabled = opts === null;
        const showAllCtl = isPartner
          ? `<div class="partner-opts"><label style="margin:0"><input type="checkbox" data-showall="${s.key}" ${showAll[s.key] ? "checked" : ""}> 全員表示（異性・夫婦等も含める）</label></div>`
          : "";
        // 「話」（ministry_talk / part6 の話の回）は兄弟のみ固定なのでチェックボックスを出さない。
        // 実演（ministry_demo）は「兄弟のみ」で相手役を省略するため、省略後もチェックは出し続ける。
        const isTalk =
          p.typeId === "ministry_talk" || (p.omitPartner && p.typeId !== "ministry_demo");
        const brothersCtl =
          p.section === "ministry" && !isPartner && !isTalk
            ? `<div class="partner-opts"><label style="margin:0"><input type="checkbox" data-brothers="${s.key}" ${brothersOnly[s.key] ? "checked" : ""}> 兄弟のみ</label></div>`
            : "";
        return `<div>
          <div class="slot-kind">${esc(s.label)}</div>
          <select data-slot="${s.key}" data-kind="${s.kind}" ${disabled ? "disabled" : ""}>
            ${disabled ? "<option>（先に生徒を選択）</option>" : opts}
          </select>
          ${showAllCtl}${brothersCtl}${gbTalkCtl}
        </div>`;
      });
      while (cells.length < 2) cells.push("<div></div>");

      const talkToggle = canTalk
        ? `<label style="margin-top:4px"><input type="checkbox" data-talk="${p.key}" ${p.omitPartner ? "checked" : ""}> この回は「話」（相手役なし）</label>`
        : "";
      listHtml += `<div class="slot-row">
        <div><div class="prog-name">${esc(p.name)}</div>${talkToggle}</div>
        ${cells.join("")}
      </div>`;
    }

    el.innerHTML = `
      <h1>割り当て</h1>
      <p class="page-desc">プルダウンは「前回担当から間が空いている順」（未担当者が最上位）。提案順に縛られず誰でも選べます。</p>
      <div class="meeting-header">
        <button class="btn" id="prev" ${idx === 0 ? "disabled" : ""}>◀ 前の集会日</button>
        <span class="date">${fmtDateFull(meeting.date)}</span>
        ${
          meeting.status === "exported"
            ? `<button id="unexport" class="badge badge-blue" style="cursor:pointer;border:none;font:inherit" title="クリックでエクスポート済みの記録だけ外します（割当は残ります）">エクスポート済み ✕</button>`
            : STATUS_BADGE[meeting.status]
        }
        <label style="margin:0 0 0 8px"><input type="checkbox" id="circuit-toggle" ${meeting.circuit ? "checked" : ""}> 巡回訪問週</label>
        ${meeting.circuit ? CIRCUIT_BADGE : ""}
        <span id="unsaved" style="${dirty ? "" : "display:none"}"><span class="unsaved-dot"></span> 未保存</span>
        <span class="spacer" style="flex:1"></span>
        <button class="btn" id="clear-all" ${Object.keys(draft).length === 0 && meeting.status === "none" ? "disabled" : ""}>全て解除</button>
        <button class="btn" id="next" ${idx === meetings.length - 1 ? "disabled" : ""}>次の集会日 ▶</button>
        <button class="btn btn-primary" id="save">保存</button>
      </div>
      <div id="notice" class="notice notice-ok" style="display:none"></div>
      <div id="program-list">${listHtml}</div>
      <dialog id="dup-dialog">
        <h3>同じ日にすでに割り当てられています</h3>
        <p id="dup-msg" style="font-size:14px"></p>
        <div class="dialog-actions">
          <button class="btn" id="dup-cancel">選び直す</button>
          <button class="btn btn-primary" id="dup-ok">このまま割り当てる</button>
        </div>
      </dialog>
      <dialog id="clear-dialog">
        <h3>この集会日の割り当てを全て解除</h3>
        <p id="clear-msg" style="font-size:14px"></p>
        <div class="dialog-actions">
          <button class="btn" id="clear-cancel">キャンセル</button>
          <button class="btn btn-primary" id="clear-ok">全て解除する</button>
        </div>
      </dialog>
      <dialog id="unexport-dialog">
        <h3>エクスポート済みの記録を外す</h3>
        <p style="font-size:14px">この集会日の「エクスポート済み」の記録だけを外します。割り当ての内容はそのまま残ります。よろしいですか？</p>
        <div class="dialog-actions">
          <button class="btn" id="unexport-cancel">キャンセル</button>
          <button class="btn btn-primary" id="unexport-ok">記録を外す</button>
        </div>
      </dialog>`;
    bind();
  }

  function setDirty(v: boolean): void {
    dirty = v;
    const u = el.querySelector<HTMLElement>("#unsaved");
    if (u) u.style.display = v ? "" : "none";
  }

  function nav(d: number): void {
    const i = meetings.indexOf(meeting) + d;
    if (i < 0 || i >= meetings.length) return;
    if (dirty && !confirm("未保存の変更があります。破棄して移動しますか？")) return;
    dirty = false;
    ctx.goto(`assign?date=${meetings[i].date}`);
  }

  function bind(): void {
    el.querySelector<HTMLButtonElement>("#prev")!.onclick = () => nav(-1);
    el.querySelector<HTMLButtonElement>("#next")!.onclick = () => nav(+1);

    el.querySelectorAll<HTMLSelectElement>("select[data-slot]").forEach((sel) => {
      sel.onchange = () => onSelect(sel);
    });
    el.querySelectorAll<HTMLInputElement>("[data-showall]").forEach((cb) => {
      cb.onchange = () => {
        showAll[cb.dataset.showall!] = cb.checked;
        render();
      };
    });
    el.querySelectorAll<HTMLInputElement>("[data-brothers]").forEach((cb) => {
      cb.onchange = () => {
        const key = cb.dataset.brothers!;
        brothersOnly[key] = cb.checked;
        // 野外奉仕の実演で「兄弟のみ」→ 相手役は不要（相手役スロットを省略）
        const prog = meeting.programs.find((p) => p.slots.some((s) => s.key === key));
        if (prog && prog.typeId === "ministry_demo") {
          prog.omitPartner = cb.checked;
          const partner = prog.slots.find((s) => s.kind === "partner");
          if (cb.checked && partner) delete draft[partner.key];
          setDirty(true);
        }
        render();
      };
    });
    // part6「話」トグル: 相手役省略＋「兄弟のみ」自動連動（§4.6）
    el.querySelectorAll<HTMLInputElement>("[data-talk]").forEach((cb) => {
      cb.onchange = () => {
        const prog = meeting.programs.find((p) => p.key === cb.dataset.talk);
        if (!prog) return;
        prog.omitPartner = cb.checked;
        const perf = prog.slots.find((s) => s.kind === "performer");
        const partner = prog.slots.find((s) => s.kind === "partner");
        if (perf) brothersOnly[perf.key] = cb.checked;
        if (cb.checked && partner) delete draft[partner.key];
        setDirty(true);
        render();
      };
    });

    // 「統治体の話」トグル: 動画のみ・司会なし → 会衆の必要スロットを割当対象外にする
    el.querySelectorAll<HTMLInputElement>("[data-gbtalk]").forEach((cb) => {
      cb.onchange = () => {
        const prog = meeting.programs.find((p) => p.key === cb.dataset.gbtalk);
        if (!prog) return;
        prog.gbTalk = cb.checked;
        if (cb.checked) for (const s of prog.slots) delete draft[s.key];
        setDirty(true);
        render();
      };
    });

    // 巡回訪問週トグル（案A: 取り込み後の訂正経路）
    el.querySelector<HTMLInputElement>("#circuit-toggle")!.onchange = async (e) => {
      const cb = e.target as HTMLInputElement;
      const toCircuit = cb.checked;
      const affected = meeting.programs
        .filter((p) => p.typeId === (toCircuit ? "cbs" : "service_talk"))
        .flatMap((p) => p.slots.map((s) => s.key))
        .filter((k) => draft[k]);
      const msg = toCircuit
        ? `この日を巡回訪問週にします。会衆聖書研究は「奉仕の話（巡回監督）」になり${affected.length ? `、割当済みの ${affected.length} 件は解除されます` : "ます"}。よろしいですか？`
        : "巡回訪問週を解除し、会衆聖書研究（司会+朗読）に戻します。よろしいですか？";
      if (!confirm(msg)) {
        cb.checked = !toCircuit;
        return;
      }
      setCircuit(meeting, toCircuit);
      for (const k of Object.keys(draft)) {
        if (!meeting.programs.some((p) => p.slots.some((s) => s.key === k))) delete draft[k];
      }
      saveAssignments(ctx.data, meeting, meeting.assignments); // ステータス再計算
      await ctx.persist(); // 構造変更は即永続化
      setDirty(true);
      render();
    };

    el.querySelector<HTMLButtonElement>("#clear-all")!.onclick = () => {
      if (Object.keys(draft).length === 0 && meeting.status === "none") return;
      const dlg = el.querySelector<HTMLDialogElement>("#clear-dialog")!;
      el.querySelector<HTMLElement>("#clear-msg")!.textContent =
        meeting.status === "exported"
          ? "この集会日の選択をすべて解除し、「エクスポート済み」の記録も消去します。よろしいですか？"
          : "この集会日の選択をすべて解除します。よろしいですか？";
      dlg.showModal();
      el.querySelector<HTMLButtonElement>("#clear-cancel")!.onclick = () => dlg.close();
      el.querySelector<HTMLButtonElement>("#clear-ok")!.onclick = async () => {
        dlg.close();
        // 即時確定: 割当・この集会由来の履歴/ペア履歴を消し、status は "none" に戻る
        draft = {};
        saveAssignments(ctx.data, meeting, draft);
        await ctx.persist();
        setDirty(false);
        render();
      };
    };

    // エクスポート済みバッジのクリック: 割当は残したまま「エクスポート済み」記録だけ外す
    const unexportBtn = el.querySelector<HTMLButtonElement>("#unexport");
    if (unexportBtn)
      unexportBtn.onclick = () => {
        const dlg = el.querySelector<HTMLDialogElement>("#unexport-dialog")!;
        dlg.showModal();
        el.querySelector<HTMLButtonElement>("#unexport-cancel")!.onclick = () => dlg.close();
        el.querySelector<HTMLButtonElement>("#unexport-ok")!.onclick = async () => {
          dlg.close();
          meeting.status = calcStatus(meeting); // 保存済み割当から再計算（exported → 割当済み等）
          await ctx.persist();
          render();
        };
      };

    el.querySelector<HTMLButtonElement>("#save")!.onclick = async () => {
      saveAssignments(ctx.data, meeting, draft);
      const r = await ctx.persist();
      setDirty(false);
      const n = Object.keys(draft).length;
      render();
      alert(`保存しました（${n} / ${totalSlotCount(meeting)} スロット）。${r.idb ? "" : "\n警告: アプリ内DBへの保存に失敗しました。"}`);
    };
  }

  function onSelect(sel: HTMLSelectElement): void {
    const key = sel.dataset.slot!;
    const memberId = sel.value || undefined;

    const commit = (): void => {
      if (memberId) draft[key] = memberId;
      else delete draft[key];
      setDirty(true);
      render(); // 未保存の選択も他プルダウンの並び順に反映する（§4.6）
    };

    // 同一日の重複は確認のみ（§6-7）
    if (memberId) {
      const dupCount = Object.entries(draft).filter(([k, v]) => k !== key && v === memberId).length;
      if (dupCount > 0) {
        const dlg = el.querySelector<HTMLDialogElement>("#dup-dialog")!;
        el.querySelector<HTMLElement>("#dup-msg")!.textContent =
          `${memberName(memberId)} さんは、この集会日ですでに ${dupCount} 件の割り当てがあります。続行しますか？`;
        dlg.showModal();
        el.querySelector<HTMLButtonElement>("#dup-ok")!.onclick = () => {
          dlg.close();
          commit();
        };
        el.querySelector<HTMLButtonElement>("#dup-cancel")!.onclick = () => {
          dlg.close();
          sel.value = draft[key] ?? "";
        };
        return;
      }
    }
    commit();
  }

  render();
}
