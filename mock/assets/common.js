/* ============================================================
   共通ロジック（モック用）
   - サイドバー描画
   - 優先度計算（要件定義.md §4.6 / §6 のルールを実装）
   実装時: 優先度計算部（candidatesFor / partnerCandidatesFor 等）は
   そのまま TypeScript 化して本体の priority モジュールに流用できる。
   ============================================================ */

// ---------- ナビゲーション ----------
const NAV = [
  { section: "日常運用" },
  { href: "index.html",           label: "ホーム（集会日一覧）", id: "home" },
  { href: "assign.html",          label: "割り当て",             id: "assign" },
  { href: "import-excel.html",    label: "Excel 取り込み",       id: "import-excel" },
  { href: "export.html",          label: "エクスポート",         id: "export" },
  { section: "マスター管理" },
  { href: "members.html",         label: "成員マスター",         id: "members" },
  { href: "roles.html",           label: "ロール設定",           id: "roles" },
  { href: "priority-groups.html", label: "優先度グループ",       id: "priority-groups" },
  { section: "データ管理" },
  { href: "import-history.html",  label: "履歴インポート",       id: "import-history" },
  { href: "settings.html",        label: "バックアップ・設定",   id: "settings" },
];

function renderSidebar(activeId) {
  const items = NAV.map((n) =>
    n.section
      ? `<div class="nav-section">${n.section}</div>`
      : `<a href="${n.href}" class="${n.id === activeId ? "active" : ""}">${n.label}</a>`
  ).join("");
  document.body.insertAdjacentHTML(
    "afterbegin",
    `<aside class="sidebar">
       <div class="app-title">週日の集会<br>割り当てツール</div>
       <nav>${items}</nav>
     </aside>`
  );
}

// ---------- 汎用ヘルパー ----------
const byId = (arr, id) => arr.find((x) => x.id === id);
const memberName = (id) => byId(MEMBERS, id)?.name ?? "?";

function fmtDate(iso) {
  if (!iso) return "未";
  const [, m, d] = iso.split("-");
  return `${Number(m)}/${Number(d)}`;
}
function fmtDateFull(iso) {
  const [y, m, d] = iso.split("-");
  const dt = new Date(Number(y), Number(m) - 1, Number(d));
  const w = "日月火水木金土"[dt.getDay()];
  return `${y}年${Number(m)}月${Number(d)}日（${w}）`;
}

// 成員がロールを保持しているか（個別付与＋ロールグループ経由）
function memberRoleIds(member) {
  const fromGroups = member.roleGroupIds.flatMap((gid) => byId(ROLE_GROUPS, gid)?.roleIds ?? []);
  return [...new Set([...member.roleIds, ...fromGroups])];
}
function memberHasRole(member, roleId) {
  return memberRoleIds(member).includes(roleId);
}
function roleHolders(roleId) {
  return MEMBERS.filter((m) => memberHasRole(m, roleId));
}

// ---------- 優先度計算(§4.6) ----------
// 履歴の判定単位: ロールが優先度グループに属すればグループ内全ロールの履歴を合算
function historyRoleIds(roleId) {
  const role = byId(ROLES, roleId);
  if (role?.priorityGroupId) {
    return byId(PRIORITY_GROUPS, role.priorityGroupId)?.roleIds ?? [roleId];
  }
  return [roleId];
}

function lastAssignedDate(memberId, roleId) {
  const rids = historyRoleIds(roleId);
  const dates = HISTORY.filter((h) => h.memberId === memberId && rids.includes(h.roleId)).map((h) => h.date);
  return dates.length ? dates.sort().at(-1) : null; // ISO 文字列は辞書順 = 日付順
}
function assignmentCount(memberId, roleId) {
  const rids = historyRoleIds(roleId);
  return HISTORY.filter((h) => h.memberId === memberId && rids.includes(h.roleId)).length;
}

// タイブレーク③のランダムを描画のたびに変えない（固定シード的ハッシュ）
function stableJitter(memberId, roleId) {
  let h = 0;
  const s = memberId + roleId;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) & 0xffff;
  return h;
}

// スロット候補: 在籍かつロール保持者を「未担当最優先 → 最終担当日が古い順 → 回数少 → 疑似ランダム」で返す
function candidatesFor(roleId, { gender = null } = {}) {
  return MEMBERS.filter(
    (m) => m.status === "active" && memberHasRole(m, roleId) && (!gender || m.gender === gender)
  )
    .map((m) => ({
      member: m,
      last: lastAssignedDate(m.id, roleId),
      count: assignmentCount(m.id, roleId),
    }))
    .sort((a, b) => {
      if ((a.last === null) !== (b.last === null)) return a.last === null ? -1 : 1;
      if (a.last !== b.last) return a.last < b.last ? -1 : 1;
      if (a.count !== b.count) return a.count - b.count;
      return stableJitter(a.member.id, roleId) - stableJitter(b.member.id, roleId);
    });
}

// 相手役候補: 主キー＝演者とのペア最終担当日（未ペア最優先）／副キー＝相手役個人の最終担当日
// 既定は演者と同性のみ。showAll=true で異性（夫婦等）も含める（§6-5）。
function pairLastDate(performerId, partnerId) {
  const dates = PAIR_HISTORY.filter(
    (p) =>
      (p.performerId === performerId && p.partnerId === partnerId) ||
      (p.performerId === partnerId && p.partnerId === performerId)
  ).map((p) => p.date);
  return dates.length ? dates.sort().at(-1) : null;
}

function partnerCandidatesFor(roleId, performerId, { showAll = false } = {}) {
  const performer = byId(MEMBERS, performerId);
  if (!performer) return [];
  return MEMBERS.filter(
    (m) =>
      m.status === "active" &&
      m.id !== performerId &&
      memberHasRole(m, roleId) &&
      (showAll || m.gender === performer.gender)
  )
    .map((m) => ({
      member: m,
      pairLast: pairLastDate(performerId, m.id),
      last: lastAssignedDate(m.id, roleId),
    }))
    .sort((a, b) => {
      if ((a.pairLast === null) !== (b.pairLast === null)) return a.pairLast === null ? -1 : 1;
      if (a.pairLast !== b.pairLast) return a.pairLast < b.pairLast ? -1 : 1;
      if ((a.last === null) !== (b.last === null)) return a.last === null ? -1 : 1;
      if (a.last !== b.last) return a.last < b.last ? -1 : 1;
      return stableJitter(a.member.id, roleId) - stableJitter(b.member.id, roleId);
    });
}

// ---------- 集会プログラムのひな型（§11 の構成） ----------
// meeting から画面表示用のプログラム＋スロット一覧を構築する。
// slotKey = "p{プログラム番号}-s{スロット番号}"（MEETINGS.assignments のキーと一致）
function buildPrograms(meeting) {
  const progs = [
    { section: null,        name: "開会の祈り",            slots: [{ roleId: "r_prayer", kind: "single", label: "祈り" }] },
    { section: null,        name: "司会者",                slots: [{ roleId: "r_chairman", kind: "single", label: "司会" }] },
    { section: "treasures", name: "1. 宝の話",             slots: [{ roleId: "r_treasures", kind: "single", label: "話" }] },
    { section: "treasures", name: "2. 宝石を探し出す",     slots: [{ roleId: "r_gems", kind: "single", label: "話" }] },
    { section: "treasures", name: "3. 聖書朗読",           slots: [{ roleId: "r_bible_reading", kind: "single", label: "生徒" }] },
    { section: "ministry",  name: "4. 実演",               slots: [
        { roleId: "r_student", kind: "performer", label: "生徒" },
        { roleId: "r_student", kind: "partner",   label: "相手" } ] },
    { section: "ministry",  name: "5. 実演",               slots: [
        { roleId: "r_student", kind: "performer", label: "生徒" },
        { roleId: "r_student", kind: "partner",   label: "相手" } ] },
    { section: "ministry",  name: "6. 実演／話",           slots: [
        { roleId: "r_student", kind: "performer", label: "生徒" },
        { roleId: "r_student", kind: "partner",   label: "相手（話の回は省略）" } ] },
    { section: "living",    name: "7. 生活の話・討議",     slots: [{ roleId: "r_living", kind: "single", label: "話/討議" }] },
    meeting.circuit
      ? { section: "living", name: "8. 奉仕の話（巡回監督）", noAssign: true, slots: [] }
      : { section: "living", name: "8. 会衆聖書研究",       slots: [
          { roleId: "r_cbs_conductor", kind: "single", label: "司会" },
          { roleId: "r_cbs_reader",   kind: "single", label: "朗読" } ] },
    { section: null,        name: "閉会の祈り",            slots: [{ roleId: "r_prayer", kind: "single", label: "祈り" }] },
  ];
  progs.forEach((p, pi) => {
    p.key = `p${pi}`;
    p.slots.forEach((s, si) => (s.key = `p${pi}-s${si}`));
  });
  return progs;
}

function totalSlotCount(meeting) {
  return buildPrograms(meeting).reduce((n, p) => n + p.slots.length, 0);
}

const STATUS_BADGE = {
  none:     '<span class="badge badge-gray">未割当</span>',
  partial:  '<span class="badge badge-amber">一部割当</span>',
  done:     '<span class="badge badge-green">割当済み</span>',
  exported: '<span class="badge badge-blue">エクスポート済み</span>',
};
