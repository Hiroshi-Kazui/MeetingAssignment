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
];

/** 旧「マスター管理」「データ管理」。歯車アイコンの「設定」配下にツリー表示する */
const SETTINGS_CHILDREN: NavItem[] = [
  { route: "members", label: "成員マスター" },
  { route: "import-members", label: "成員CSV取り込み" },
  { route: "roles", label: "ロール設定" },
  { route: "priority-groups", label: "割当関連グループ" },
  { route: "import-history", label: "履歴インポート" },
  { route: "settings", label: "バックアップ・設定" },
];
const SETTINGS_ROUTES = new Set(SETTINGS_CHILDREN.map((n) => n.route));

/** 「設定」ツリーの開閉状態。SPA モジュール内で保持し、画面遷移では変化しない */
let settingsOpen = false;

function navLink(n: NavItem, activeRoute: string): string {
  return `<a href="#/${n.route}" class="${n.route === activeRoute ? "active" : ""}">${n.label}</a>`;
}

export function renderSidebar(activeRoute: string): string {
  const items = NAV.map((n) => (n.section ? `<div class="nav-section">${n.section}</div>` : navLink(n, activeRoute))).join("");
  const childItems = SETTINGS_CHILDREN.map((n) => navLink(n, activeRoute)).join("");
  const open = settingsOpen;
  return `<aside class="sidebar">
    <div class="app-title">週日の集会<br>割り当てツール</div>
    <nav>
      ${items}
      <button type="button" class="nav-toggle${open ? " open" : ""}" id="nav-settings-toggle">
        <span><span class="gear">⚙</span> 設定</span><span class="chev">${open ? "▾" : "▸"}</span>
      </button>
      <div class="nav-children"${open ? "" : " hidden"}>${childItems}</div>
    </nav>
  </aside>`;
}

/**
 * 画面遷移時に呼ぶ。「設定」配下のページへ遷移したら自動で開く。
 * トグルクリックからは呼ばない（呼ぶと子ページ表示中はクリックしても閉じられなくなるため）。
 */
export function syncSidebarForRoute(activeRoute: string): void {
  if (SETTINGS_ROUTES.has(activeRoute)) settingsOpen = true;
}

/**
 * 「設定」トグルのクリックを配線する。root 内の .sidebar だけを差し替えるため
 * main#view（現在の画面の未保存状態）には影響しない。
 */
export function bindSidebarToggle(root: HTMLElement, activeRoute: string): void {
  const toggle = root.querySelector<HTMLButtonElement>("#nav-settings-toggle");
  if (!toggle) return;
  toggle.onclick = () => {
    settingsOpen = !settingsOpen;
    const aside = root.querySelector<HTMLElement>(".sidebar");
    if (aside) aside.outerHTML = renderSidebar(activeRoute);
    bindSidebarToggle(root, activeRoute);
  };
}

export function parseHash(): { route: string; params: URLSearchParams } {
  const h = location.hash.replace(/^#\/?/, "");
  const [route, query] = h.split("?");
  return { route: route || "home", params: new URLSearchParams(query ?? "") };
}
