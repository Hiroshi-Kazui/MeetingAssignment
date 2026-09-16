/**
 * アプリ状態の読み込み・保存（要件定義 §3: IndexedDB + data.json 二重書き込み）
 * 初期データとして既定ロール一式を投入（§7 S3）。
 */
import type { AppData, SectionAlias, TypeKeyword } from "./models";
import { idbLoad, idbSave } from "./db";
import { loadDataJson, saveDataJson } from "./platform";
import { memberHasRole } from "./logic/priority";
import { matchesKeyword, typeDef } from "./logic/programs";

/**
 * 既定のセクション見出し別名（§4.3）。ワークブックの改称に追従するため
 * 利用者が設定画面から追加できる。builtin は削除不可で migrate が補充する。
 */
const BUILTIN_SECTION_ALIASES: SectionAlias[] = [
  { id: "sa_treasures", keyword: "神の言葉の宝", section: "treasures", builtin: true },
  { id: "sa_ministry_old", keyword: "野外奉仕に励む", section: "ministry", builtin: true },
  { id: "sa_ministry_new", keyword: "伝道を楽しもう", section: "ministry", builtin: true },
  { id: "sa_living", keyword: "クリスチャンとして生活する", section: "living", builtin: true },
];

/**
 * 既定のプログラム名の呼び方（§4.3）。項目名だけの改称に追従するため
 * 利用者が設定画面から追加できる。builtin は削除不可で migrate が補充する。
 * 「会衆の必要」は 2026 年に「会衆で考えたいこと」へ改称された。
 */
const BUILTIN_TYPE_KEYWORDS: TypeKeyword[] = [
  { id: "tk_ln_old", keyword: "会衆の必要", target: "local_needs", builtin: true },
  { id: "tk_ln_old2", keyword: "会衆必要", target: "local_needs", builtin: true },
  { id: "tk_ln_new", keyword: "会衆で考えたいこと", target: "local_needs", builtin: true },
  { id: "tk_cbs", keyword: "会衆の聖書研究", target: "cbs", builtin: true },
  { id: "tk_cbs2", keyword: "会衆聖書研究", target: "cbs", builtin: true },
  { id: "tk_service", keyword: "奉仕の話", target: "service_talk", builtin: true },
  { id: "tk_reading", keyword: "聖書朗読", target: "bible_reading", builtin: true },
  { id: "tk_gems", keyword: "宝石", target: "gems", builtin: true },
  { id: "tk_open", keyword: "開会の言葉", target: "opening_words", builtin: true },
  { id: "tk_open2", keyword: "開会のことば", target: "opening_words", builtin: true },
  { id: "tk_close", keyword: "閉会の言葉", target: "closing_words", builtin: true },
  { id: "tk_close2", keyword: "閉会のことば", target: "closing_words", builtin: true },
  { id: "tk_prayer", keyword: "祈り", target: "prayer", builtin: true },
];

/** 既定ロール・ロールグループ・割当関連グループ（§4.2 / §11。S3・S4 で変更可） */
export function defaultData(): AppData {
  return {
    version: 1,
    savedAt: "",
    members: [],
    roles: [
      { id: "r_prayer", name: "祈り", slotType: "祈り", priorityGroupId: null },
      { id: "r_chairman", name: "司会者（集会全体）", slotType: "司会", priorityGroupId: null },
      { id: "r_treasures", name: "神の言葉の宝（話）", slotType: "話", priorityGroupId: "pg_treasures" },
      { id: "r_gems", name: "宝石を探し出す", slotType: "話", priorityGroupId: "pg_treasures" },
      { id: "r_bible_reading", name: "聖書朗読", slotType: "生徒", priorityGroupId: null },
      { id: "r_student", name: "野外奉仕・生徒", slotType: "生徒/相手", priorityGroupId: null },
      { id: "r_living", name: "クリスチャンとして生活（話・討議）", slotType: "話/討議", priorityGroupId: "pg_living" },
      { id: "r_local_needs", name: "クリスチャンとして生活（会衆の必要）", slotType: "話", priorityGroupId: null },
      { id: "r_cbs_conductor", name: "会衆聖書研究・司会", slotType: "司会", priorityGroupId: null },
      { id: "r_cbs_reader", name: "会衆聖書研究・朗読", slotType: "朗読", priorityGroupId: null },
    ],
    roleGroups: [
      { id: "rg_elder", name: "長老",
        roleIds: ["r_prayer", "r_chairman", "r_treasures", "r_gems", "r_living", "r_cbs_conductor"] },
      { id: "rg_ms", name: "奉仕の僕",
        roleIds: ["r_prayer", "r_bible_reading", "r_cbs_reader", "r_student"] },
      { id: "rg_student_b", name: "生徒（兄弟）", roleIds: ["r_student", "r_bible_reading"] },
      { id: "rg_student_s", name: "生徒（姉妹）", roleIds: ["r_student"] },
    ],
    priorityGroups: [
      { id: "pg_treasures", name: "宝 part1 + part2", roleIds: ["r_treasures", "r_gems"] },
      { id: "pg_living", name: "生活の討議・話（part7系）", roleIds: ["r_living"] },
    ],
    meetings: [],
    history: [],
    pairHistory: [],
    typeRules: [],
    nameAliases: [],
    sectionAliases: BUILTIN_SECTION_ALIASES.map((a) => ({ ...a })),
    typeKeywords: BUILTIN_TYPE_KEYWORDS.map((k) => ({ ...k })),
  };
}

export interface SaveResult {
  idb: boolean;
  file: boolean; // data.json（ブラウザ開発モードでは常に false）
  savedAt: string;
}

/**
 * 起動時ロード: IndexedDB → 破損/空なら data.json から復旧 → どちらも無ければ初期データ。
 */
export async function loadAppData(): Promise<AppData> {
  const fromIdb = await idbLoad();
  if (fromIdb) return migrate(fromIdb);

  const json = await loadDataJson();
  if (json) {
    try {
      return migrate(JSON.parse(json) as AppData);
    } catch (e) {
      console.error("data.json の解析に失敗（初期データで起動します）", e);
    }
  }
  return defaultData();
}

/** 二重書き込み（IndexedDB + data.json）。失敗しても片方は残る */
export async function persist(data: AppData): Promise<SaveResult> {
  data.savedAt = new Date().toISOString();
  let idb = true;
  try {
    await idbSave(data);
  } catch (e) {
    idb = false;
    console.error("IndexedDB への保存に失敗", e);
  }
  const file = await saveDataJson(JSON.stringify(data, null, 1));
  return { idb, file, savedAt: data.savedAt };
}

/** 既定ロール名の変更履歴。保存済みデータの名称が旧既定値のままなら新既定値へ更新する
 *  （S3 でユーザーが手動リネームした名称は上書きしない） */
const ROLE_RENAMES: Record<string, string> = {
  r_treasures: "宝の話（part1）",
  r_gems: "宝石を探し出す（part2）",
  r_bible_reading: "聖書朗読（part3・生徒）",
  r_student: "野外奉仕・生徒（part4-6）",
  r_living: "生活の話・討議（part7）",
};

/** 将来のスキーマ変更用フック。欠損フィールドの補完＋履歴からのロール補完 */
export function migrate(d: AppData): AppData {
  const def = defaultData();
  const merged: AppData = { ...def, ...d, version: 1, roles: d.roles ?? def.roles };

  // 既定ロール名の更新（旧既定値のままの場合のみ。手動リネームは尊重）
  for (const r of merged.roles) {
    const oldName = ROLE_RENAMES[r.id];
    if (oldName && r.name === oldName) {
      r.name = def.roles.find((dr) => dr.id === r.id)!.name;
    }
  }
  // 新設ロール（クリスチャンとして生活：会衆の必要）を既存データにも追加
  if (!merged.roles.some((r) => r.id === "r_local_needs")) {
    merged.roles.push(def.roles.find((r) => r.id === "r_local_needs")!);
  }
  // 会衆の必要スロットは討議（r_living）と共有していたのを分離した。
  // 既に取り込み済みの集会は焼き付け済みの roleId が旧値のままなので付け替える。
  // 注意: 過去に記録済みの history（roleId=r_living）は local_needs 由来かの
  // 判別が付かないため、新ロールへは引き継がない（討議とまとめて記録済み）。
  for (const mt of merged.meetings) {
    for (const p of mt.programs) {
      if (p.typeId !== "local_needs") continue;
      for (const s of p.slots) {
        if (s.roleId === "r_living") s.roleId = "r_local_needs";
      }
    }
  }
  // 祈りプログラムの表示名は Excel の C列（歌番号だけ。例: "27"）が焼き付いて
  // いるため、型ラベル（開会の祈り/閉会の祈り）へ揃える。冪等。
  for (const mt of merged.meetings) {
    for (const p of mt.programs) {
      if (p.typeId === "prayer_open") p.name = "開会の祈り";
      else if (p.typeId === "prayer_close") p.name = "閉会の祈り";
    }
  }

  // セクション見出し別名: 既定分（builtin）の不足を補う。利用者の追加分・
  // 並び順・編集内容は保持する。冪等。
  if (!Array.isArray(merged.sectionAliases)) merged.sectionAliases = [];
  for (const b of BUILTIN_SECTION_ALIASES) {
    if (!merged.sectionAliases.some((a) => a.id === b.id)) merged.sectionAliases.push({ ...b });
  }
  // プログラム名の呼び方も同様に既定分を補う。冪等。
  if (!Array.isArray(merged.typeKeywords)) merged.typeKeywords = [];
  for (const b of BUILTIN_TYPE_KEYWORDS) {
    if (!merged.typeKeywords.some((k) => k.id === b.id)) merged.typeKeywords.push({ ...b });
  }
  // 「会衆の必要」→「会衆で考えたいこと」の改称に対応する前（〜0.1.x）に取り込んだ
  // 集会は part7 が討議（living_discussion）のまま焼き付いている。呼び方マスタに
  // 一致するものを local_needs へ付け替え、ロールも専用ロールへ寄せる。
  // 割当済みの成員はスロットキーが変わらないためそのまま残る。冪等。
  for (const mt of merged.meetings) {
    for (const p of mt.programs) {
      if (p.typeId !== "living_discussion") continue;
      if (!matchesKeyword(p.name, "local_needs", merged.typeKeywords)) continue;
      p.typeId = "local_needs";
      for (const s of p.slots) {
        if (s.roleId === "r_living") s.roleId = "r_local_needs";
      }
    }
  }
  // 取り込みレビューでの手動修正の記憶（typeRules）が同じ理由で誤った型を
  // 覚えていると、再取り込みしてもキーワード判定より優先されて直らない。
  // local_needs の呼び方に一致するのに別の型を指す記憶は捨て、自動判定に戻す。冪等。
  if (!Array.isArray(merged.typeRules)) merged.typeRules = [];
  merged.typeRules = merged.typeRules.filter(
    (r) => r.typeId === "local_needs" || !matchesKeyword(r.signature, "local_needs", merged.typeKeywords)
  );

  // スロットの表示名は取り込み時に各集会へ焼き付くため、型定義側を改称しても
  // 既存データは旧名のまま残る。型ラベルから再同期する（roleId は触らない）。冪等。
  for (const mt of merged.meetings) {
    for (const p of mt.programs) {
      const td = typeDef(p.typeId);
      if (!td) continue;
      p.slots.forEach((s, i) => {
        const dl = td.slots[i]?.label;
        if (dl) s.label = dl;
      });
    }
  }

  // 履歴で担当したロールを成員に補完する（未保持なら付与）。履歴インポートで
  // ロール未設定のまま作られた成員が割当候補に出ない問題への対処（§4.7）。冪等。
  for (const h of merged.history) {
    const m = merged.members.find((x) => x.id === h.memberId);
    if (m && !memberHasRole(merged, m, h.roleId) && !m.roleIds.includes(h.roleId)) {
      m.roleIds.push(h.roleId);
    }
  }
  return merged;
}
