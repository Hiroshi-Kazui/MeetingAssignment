/**
 * アプリ状態の読み込み・保存（要件定義 §3: IndexedDB + data.json 二重書き込み）
 * 初期データとして既定ロール一式を投入（§7 S3）。
 */
import type { AppData } from "./models";
import { idbLoad, idbSave } from "./db";
import { loadDataJson, saveDataJson } from "./platform";
import { memberHasRole } from "./logic/priority";

/** 既定ロール・ロールグループ・優先度グループ（§4.2 / §11。S3・S4 で変更可） */
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
function migrate(d: AppData): AppData {
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
