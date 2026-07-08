/** エントリポイント: 状態ロード → ハッシュルーティングで S1〜S9 を描画 */
import "./styles.css";
import { loadAppData, persist } from "./state";
import { parseHash, renderSidebar, type Ctx, type View } from "./ui/router";
import { homeView } from "./views/home";
import { assignView } from "./views/assign";
import { membersView } from "./views/members";
import { importMembersView } from "./views/importMembers";
import { rolesView } from "./views/roles";
import { priorityGroupsView } from "./views/priorityGroups";
import { importExcelView } from "./views/importExcel";
import { importHistoryView } from "./views/importHistory";
import { exportView } from "./views/exportView";
import { settingsView } from "./views/settings";

const VIEWS: Record<string, View> = {
  home: homeView,
  assign: assignView,
  members: membersView,
  "import-members": importMembersView,
  roles: rolesView,
  "priority-groups": priorityGroupsView,
  "import-excel": importExcelView,
  "import-history": importHistoryView,
  export: exportView,
  settings: settingsView,
};

async function boot(): Promise<void> {
  const data = await loadAppData();
  const root = document.getElementById("app")!;
  let dirtyGuard: (() => boolean) | null = null;
  let currentHash = location.hash || "#/home";

  const ctx: Ctx = {
    data,
    persist: () => persist(data),
    goto: (route) => {
      location.hash = `#/${route}`;
    },
    refresh: () => renderRoute(),
    setDirtyGuard: (g) => {
      dirtyGuard = g;
    },
  };

  function renderRoute(): void {
    const { route, params } = parseHash();
    const view = VIEWS[route] ?? VIEWS.home;
    dirtyGuard = null;
    root.innerHTML = `${renderSidebar(route in VIEWS ? route : "home")}<main id="view"></main>`;
    view(root.querySelector<HTMLElement>("#view")!, ctx, params);
  }

  window.addEventListener("hashchange", () => {
    // 未保存ガード（§7 共通事項）。assign 画面内の prev/next は自前で確認して
    // dirty を落としてから遷移するため二重確認にはならない
    if (dirtyGuard?.() && !confirm("未保存の変更があります。破棄して移動しますか？")) {
      history.replaceState(null, "", currentHash); // hashchange を再発火させずに戻す
      return;
    }
    currentHash = location.hash;
    renderRoute();
  });
  window.addEventListener("beforeunload", (e) => {
    if (dirtyGuard?.()) e.preventDefault();
  });

  renderRoute();
}

void boot();
