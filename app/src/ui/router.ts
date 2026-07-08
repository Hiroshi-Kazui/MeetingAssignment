/**
 * ハッシュルーティング＋サイドバー（S1〜S9 共通ナビ / 要件定義 §7 共通事項）
 * mock は 9 枚の独立 HTML だったが、実装では状態共有・未保存ガードのため SPA に統合。
 */
import type { AppData } from "../models";
import type { SaveResult } from "../state";

export interface Ctx {
  data: AppData;
  /** 二重書き込みで永続化（§3）。呼び出し側は await するだけでよい */
  persist(): Promise<SaveResult>;
  goto(route: string): void; // 例: "assign?date=2026-07-07"
  refresh(): void; // 現在の view を再描画
  /** 画面離脱ガード（S7 用）。view が未保存状態のとき true を返す関数を登録 */
  setDirtyGuard(guard: (() => boolean) | null): void;
}

export type View = (container: HTMLElement, ctx: Ctx, params: URLSearchParams) => void;

interface NavItem {
  section?: string;
  route?: string;
  label?: string;
}

const NAV: NavItem[] = [
  { section: "日常運用" },
  { route: "home", label: "ホーム（集会日一覧）" },
  { route: "assign", label: "割り当て" },
  { route: "import-excel", label: "Excel 取り込み" },
  { route: "export", label: "エクスポート" },
  { section: "マスター管理" },
  { route: "members", label: "成員マスター" },
  { route: "import-members", label: "成員CSV取り込み" },
  { route: "roles", label: "ロール設定" },
  { route: "priority-groups", label: "優先度グループ" },
  { section: "データ管理" },
  { route: "import-history", label: "履歴インポート" },
  { route: "settings", label: "バックアップ・設定" },
];

export function renderSidebar(activeRoute: string): string {
  const items = NAV.map((n) =>
    n.section
      ? `<div class="nav-section">${n.section}</div>`
      : `<a href="#/${n.route}" class="${n.route === activeRoute ? "active" : ""}">${n.label}</a>`
  ).join("");
  return `<aside class="sidebar">
    <div class="app-title">週日の集会<br>割り当てツール</div>
    <nav>${items}</nav>
  </aside>`;
}

export function parseHash(): { route: string; params: URLSearchParams } {
  const h = location.hash.replace(/^#\/?/, "");
  const [route, query] = h.split("?");
  return { route: route || "home", params: new URLSearchParams(query ?? "") };
}
