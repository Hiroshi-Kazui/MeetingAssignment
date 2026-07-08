/**
 * アプリ状態の読み込み・保存（要件定義 §3: IndexedDB + data.json 二重書き込み）
 * 初期データとして既定ロール一式を投入（§7 S3）。
 */
import type { AppData } from "./models";
import { idbLoad, idbSave } from "./db";
import { loadDataJson, saveDataJson } from "./platform";

/** 既定ロール・ロールグループ・優先度グループ（§4.2 / §11。S3・S4 で変更可） */
export function defaultData(): AppData {
  return {
    version: 1,
    savedAt: "",
    members: [],
    roles: [
      { id: "r_prayer", name: "祈り", slotType: "祈り", priorityGroupId: null },
      { id: "r_chairman", name: "司会者（集会全体）", slotType: "司会", priorityGroupId: null },
      { id: "r_treasures", name: "宝の話（part1）", slotType: "話", priorityGroupId: "pg_treasures" },
      { id: "r_gems", name: "宝石を探し出す（part2）", slotType: "話", priorityGroupId: "pg_treasures" },
      { id: "r_bible_reading", name: "聖書朗読（part3・生徒）", slotType: "生徒", priorityGroupId: null },
      { id: "r_student", name: "野外奉仕・生徒（part4-6）", slotType: "生徒/相手", priorityGroupId: null },
      { id: "r_living", name: "生活の話・討議（part7）", slotType: "話/討議", priorityGroupId: "pg_living" },
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

/** 将来のスキーマ変更用フック。現状は欠損フィールドの補完のみ */
function migrate(d: AppData): AppData {
  const def = defaultData();
  return { ...def, ...d, version: 1 };
}
