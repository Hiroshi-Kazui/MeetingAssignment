/* ============================================================
   サンプルデータ（モック用・全員架空）
   構造は 要件定義.md §5 データモデルに準拠。
   実装時はこのファイルを IndexedDB / data.json のストア層に
   置き換える（インターフェースは同じ配列構造を想定）。
   日付はすべて ISO 形式 'YYYY-MM-DD'。
   ============================================================ */

// ---------- ロール（Role） ----------
// slotType: プログラム上の役割種別（表示用）
// priorityGroupId: 属する優先度グループ（履歴合算単位）。null = ロール単体。
const ROLES = [
  { id: "r_prayer",        name: "祈り",               slotType: "祈り",          priorityGroupId: null },
  { id: "r_chairman",      name: "司会者（集会全体）", slotType: "司会",          priorityGroupId: null },
  { id: "r_treasures",     name: "宝の話（part1）",    slotType: "話",            priorityGroupId: "pg_treasures" },
  { id: "r_gems",          name: "宝石を探し出す（part2）", slotType: "話",       priorityGroupId: "pg_treasures" },
  { id: "r_bible_reading", name: "聖書朗読（part3・生徒）", slotType: "生徒",     priorityGroupId: null },
  { id: "r_student",       name: "野外奉仕・生徒（part4-6）", slotType: "生徒/相手", priorityGroupId: null },
  { id: "r_living",        name: "生活の話・討議（part7）", slotType: "話/討議",  priorityGroupId: "pg_living" },
  { id: "r_cbs_conductor", name: "会衆聖書研究・司会", slotType: "司会",          priorityGroupId: null },
  { id: "r_cbs_reader",    name: "会衆聖書研究・朗読", slotType: "朗読",          priorityGroupId: null },
];

// ---------- ロールグループ（RoleGroup）: 成員への一括付与用 ----------
const ROLE_GROUPS = [
  { id: "rg_elder",     name: "長老",
    roleIds: ["r_prayer", "r_chairman", "r_treasures", "r_gems", "r_living", "r_cbs_conductor"] },
  { id: "rg_ms",        name: "奉仕の僕",
    roleIds: ["r_prayer", "r_bible_reading", "r_cbs_reader", "r_student"] },
  { id: "rg_student_b", name: "生徒（兄弟）",
    roleIds: ["r_student", "r_bible_reading"] },
  { id: "rg_student_s", name: "生徒（姉妹）",
    roleIds: ["r_student"] },
];

// ---------- 優先度グループ（PriorityGroup）: 履歴合算単位 ----------
const PRIORITY_GROUPS = [
  { id: "pg_treasures", name: "宝 part1 + part2",        roleIds: ["r_treasures", "r_gems"] },
  { id: "pg_living",    name: "生活の討議・話（part7系）", roleIds: ["r_living"] },
];

// ---------- 成員（Member） ----------
// gender: 'M' | 'F' / status: 'active'（在籍） | 'inactive'（非活動・転出）
const MEMBERS = [
  { id: "m01", name: "山田 健一",   gender: "M", status: "active",   roleIds: [], roleGroupIds: ["rg_elder"] },
  { id: "m02", name: "佐藤 太郎",   gender: "M", status: "active",   roleIds: [], roleGroupIds: ["rg_elder"] },
  { id: "m03", name: "高橋 誠",     gender: "M", status: "active",   roleIds: [], roleGroupIds: ["rg_ms"] },
  { id: "m04", name: "伊藤 大輔",   gender: "M", status: "active",   roleIds: ["r_living"], roleGroupIds: ["rg_ms"] },
  { id: "m05", name: "渡辺 修",     gender: "M", status: "active",   roleIds: [], roleGroupIds: ["rg_student_b"] },
  { id: "m06", name: "中村 正雄",   gender: "M", status: "active",   roleIds: [], roleGroupIds: ["rg_student_b"] },
  { id: "m07", name: "小林 勇人",   gender: "M", status: "active",   roleIds: [], roleGroupIds: ["rg_ms"] },
  { id: "m08", name: "加藤 浩",     gender: "M", status: "inactive", roleIds: [], roleGroupIds: ["rg_student_b"] },
  { id: "m09", name: "鈴木 花子",   gender: "F", status: "active",   roleIds: [], roleGroupIds: ["rg_student_s"] },
  { id: "m10", name: "田中 美咲",   gender: "F", status: "active",   roleIds: [], roleGroupIds: ["rg_student_s"] },
  { id: "m11", name: "山本 恵子",   gender: "F", status: "active",   roleIds: [], roleGroupIds: ["rg_student_s"] },
  { id: "m12", name: "松本 由美",   gender: "F", status: "active",   roleIds: [], roleGroupIds: ["rg_student_s"] },
  { id: "m13", name: "井上 さくら", gender: "F", status: "active",   roleIds: [], roleGroupIds: ["rg_student_s"] },
  { id: "m14", name: "木村 典子",   gender: "F", status: "active",   roleIds: [], roleGroupIds: ["rg_student_s"] },
];

// ---------- 履歴（Assignment 実績） ----------
// { memberId, roleId, date } — PDF インポート＋保存済み割当から蓄積される想定
const HISTORY = [
  // 4月
  { memberId: "m01", roleId: "r_treasures",     date: "2026-04-07" },
  { memberId: "m02", roleId: "r_gems",          date: "2026-04-07" },
  { memberId: "m05", roleId: "r_bible_reading", date: "2026-04-07" },
  { memberId: "m09", roleId: "r_student",       date: "2026-04-07" },
  { memberId: "m10", roleId: "r_student",       date: "2026-04-07" },
  { memberId: "m04", roleId: "r_living",        date: "2026-04-07" },
  { memberId: "m01", roleId: "r_cbs_conductor", date: "2026-04-07" },
  { memberId: "m03", roleId: "r_cbs_reader",    date: "2026-04-07" },
  { memberId: "m03", roleId: "r_prayer",        date: "2026-04-07" },
  { memberId: "m02", roleId: "r_treasures",     date: "2026-04-21" },
  { memberId: "m06", roleId: "r_bible_reading", date: "2026-04-21" },
  { memberId: "m11", roleId: "r_student",       date: "2026-04-21" },
  { memberId: "m12", roleId: "r_student",       date: "2026-04-21" },
  { memberId: "m01", roleId: "r_living",        date: "2026-04-21" },
  { memberId: "m07", roleId: "r_prayer",        date: "2026-04-21" },
  // 5月
  { memberId: "m01", roleId: "r_gems",          date: "2026-05-05" },
  { memberId: "m05", roleId: "r_student",       date: "2026-05-05" },
  { memberId: "m13", roleId: "r_student",       date: "2026-05-05" },
  { memberId: "m02", roleId: "r_cbs_conductor", date: "2026-05-05" },
  { memberId: "m07", roleId: "r_cbs_reader",    date: "2026-05-05" },
  { memberId: "m04", roleId: "r_prayer",        date: "2026-05-05" },
  { memberId: "m02", roleId: "r_living",        date: "2026-05-19" },
  { memberId: "m05", roleId: "r_bible_reading", date: "2026-05-19" },
  { memberId: "m09", roleId: "r_student",       date: "2026-05-19" },
  { memberId: "m14", roleId: "r_student",       date: "2026-05-19" },
  { memberId: "m01", roleId: "r_prayer",        date: "2026-05-19" },
  // 6月
  { memberId: "m01", roleId: "r_treasures",     date: "2026-06-02" },
  { memberId: "m06", roleId: "r_student",       date: "2026-06-02" },
  { memberId: "m10", roleId: "r_student",       date: "2026-06-02" },
  { memberId: "m04", roleId: "r_living",        date: "2026-06-02" },
  { memberId: "m01", roleId: "r_cbs_conductor", date: "2026-06-02" },
  { memberId: "m03", roleId: "r_cbs_reader",    date: "2026-06-02" },
  { memberId: "m02", roleId: "r_prayer",        date: "2026-06-02" },
  { memberId: "m03", roleId: "r_bible_reading", date: "2026-06-16" },
  { memberId: "m11", roleId: "r_student",       date: "2026-06-16" },
  { memberId: "m13", roleId: "r_student",       date: "2026-06-16" },
  { memberId: "m02", roleId: "r_gems",          date: "2026-06-16" },
  { memberId: "m07", roleId: "r_prayer",        date: "2026-06-16" },
];

// ---------- ペア履歴（PairAssignment） ----------
// { performerId, partnerId, date } — 実演の「演者 × 相手役」
const PAIR_HISTORY = [
  { performerId: "m09", partnerId: "m10", date: "2026-04-07" },
  { performerId: "m11", partnerId: "m12", date: "2026-04-21" },
  { performerId: "m05", partnerId: "m06", date: "2026-05-05" },
  { performerId: "m13", partnerId: "m09", date: "2026-05-05" },
  { performerId: "m09", partnerId: "m14", date: "2026-05-19" },
  { performerId: "m06", partnerId: "m05", date: "2026-06-02" },
  { performerId: "m10", partnerId: "m13", date: "2026-06-02" },
  { performerId: "m11", partnerId: "m14", date: "2026-06-16" },
];

// ---------- 集会日（Meeting） ----------
// status: 'none'（未割当） | 'partial'（一部割当） | 'done'（割当済み） | 'exported'（エクスポート済み）
// circuit: true = 巡回訪問週（会衆聖書研究 → 奉仕の話＝非割当）
// assignments: { [slotKey]: memberId } 保存済みの割当（slotKey は common.js の buildPrograms が生成）
const MEETINGS = [
  { id: "mt1", date: "2026-07-07", status: "exported", circuit: false,
    assignments: {
      "p0-s0": "m03", "p1-s0": "m01", "p2-s0": "m02", "p3-s0": "m01", "p4-s0": "m05",
      "p5-s0": "m09", "p5-s1": "m11", "p6-s0": "m10", "p6-s1": "m12", "p7-s0": "m06", "p7-s1": "m07",
      "p8-s0": "m04", "p9-s0": "m02", "p9-s1": "m07", "p10-s0": "m04",
    } },
  { id: "mt2", date: "2026-07-14", status: "done", circuit: false,
    assignments: {
      "p0-s0": "m07", "p1-s0": "m02", "p2-s0": "m01", "p3-s0": "m02", "p4-s0": "m06",
      "p5-s0": "m13", "p5-s1": "m14", "p6-s0": "m12", "p6-s1": "m09", "p7-s0": "m05", "p7-s1": "m03",
      "p8-s0": "m01", "p9-s0": "m01", "p9-s1": "m03", "p10-s0": "m02",
    } },
  { id: "mt3", date: "2026-07-21", status: "partial", circuit: false,
    assignments: {
      "p0-s0": "m04", "p1-s0": "m01", "p2-s0": "m02", "p3-s0": "m01", "p4-s0": "m05",
    } },
  { id: "mt4", date: "2026-07-28", status: "none", circuit: false, assignments: {} },
  { id: "mt5", date: "2026-08-04", status: "none", circuit: false, assignments: {} },
  { id: "mt6", date: "2026-08-11", status: "none", circuit: false, assignments: {} },
  { id: "mt7", date: "2026-08-18", status: "none", circuit: true,  assignments: {} },
  { id: "mt8", date: "2026-08-25", status: "none", circuit: false, assignments: {} },
];
