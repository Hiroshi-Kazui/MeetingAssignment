# 画面モック — 週日の集会 割り当てツール

`要件定義.md` §7「画面要件」（S1〜S9）に対応する HTML モック。
ブラウザで `index.html` を開くだけで動作する（ビルド・サーバ不要）。

## ファイル構成

| ファイル | 画面 |
|---|---|
| `index.html` | S1 ホーム（集会日一覧） |
| `members.html` | S2 成員マスター管理 |
| `roles.html` | S3 ロール／ロールグループ設定 |
| `priority-groups.html` | S4 優先度グループ設定 |
| `import-excel.html` | S5 Excel 取り込み（自動検出＋レビュー） |
| `import-history.html` | S6 履歴インポート（過去 PDF・名寄せ） |
| `assign.html` | S7 割り当て（中核画面。`?date=YYYY-MM-DD` で対象日指定） |
| `export.html` | S8 エクスポート（Excel 書き戻し・別名保存） |
| `settings.html` | S9 バックアップ・設定 |
| `assets/style.css` | 共通スタイル（CSS 変数ベース） |
| `assets/data.js` | サンプルデータ（**全員架空**。要件定義 §5 のデータモデル準拠） |
| `assets/common.js` | サイドバー描画＋優先度計算ロジック（§4.6 / §6 を実装） |

## モックで実際に動くもの

- S7: 優先度順プルダウン（未担当者最優先→最終担当日古い順→回数少→固定ジッタ）、
  相手役のペア履歴優先ソート、「全員表示」トグル（既定は同性のみ）、
  同一日重複の確認ダイアログ、part6「話」の相手役省略、保存によるステータス更新（メモリ内のみ）
- S2〜S4: 一覧のフィルタ・ダイアログでの追加/編集（メモリ内のみ、リロードで初期化）
- S5/S6/S8: ウィザードの流れ・レビュー表・警告表示（ファイル入出力はダミー）
- S9: バックアップ JSON の実ダウンロード

## 実装（Tauri v2）への流用方針

- **`assets/common.js` の優先度計算**（`candidatesFor` / `partnerCandidatesFor` /
  `lastAssignedDate` / `historyRoleIds` / `pairLastDate`）は §4.6・§6 のルールを
  そのまま実装したもの。TypeScript 化して本体の priority モジュールに移植する。
- **`assets/data.js` の配列構造**はストア層のインターフェース想定。実装では
  IndexedDB + data.json の永続化層に置き換え、同じ形の配列を返す。
- **`buildPrograms()`** は §11 のプログラム構成のひな型。実装では Excel 取り込み結果
  （Meeting.programs）から動的に構築する。slotKey（`p{n}-s{n}`）の採番規則は流用可。
- **`style.css` / 各画面の DOM 構造**はそのまま Tauri の WebView に移せる。
  ダミーのファイル選択ボタンを Tauri の dialog / fs API に、`alert`/`confirm` を
  アプリ内ダイアログに差し替える。

## 注意

- データはすべてメモリ内。リロードすると初期状態に戻る。
- サンプルの氏名・日付は架空（実在の成員情報は含めないこと）。
