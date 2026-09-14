# プログラム名改称への追従: セクション見出しのマスタ化 + 別名テーブル集約

## Context

JW のワークブックは**構造を変えずにプログラム名だけを改称する**ことがある。2026 年だけで 2 件発生した。

- `野外奉仕に励む` → `伝道を楽しもう`（2026 年 9-10 月ファイルの 9/11 週から）
- `会衆の必要` → `会衆で考えたいこと`（2026 年 11-12 月ファイル）

現在の取り込みロジックはこれらの名前をコード内の正規表現で直接判定しているため、改称のたびにアプリ本体の修正・再ビルド・再配布が必要になる。本アプリには自動更新機構が無く、利用者（会衆の長老・学校監督）は毎回インストーラを手動で入れ直すことになる。

被害の大きさは判定の種類によって異なる。part 番号（1.〜8.）による判定が大半を吸収するため、**壊れるのは番号で救えない箇所だけ**である。

| 依存 | 番号ルールの救済 | 2026年11-12月ファイルでの実測 |
|---|---|---|
| セクション見出し | **なし** | section 不明となり part4-6 が**全て未分類** |
| `会衆の必要` | なし（part7 は討議と同番号） | 静かに「討議」へ誤分類 |
| `会衆の聖書研究` / `奉仕の話` / 開会・閉会の言葉 | なし | 改称されれば同様に誤分類 |
| `聖書朗読` `宝石を探し出す` | あり（3. / 2.） | 改称されても無事 |

したがって **セクション見出しだけをデータ（マスタ）化して利用者が自力で追加できるようにし、残りの名前依存はコード内の別名テーブル 1 箇所に集約する**のが費用対効果として最良。見出し以外はレビュー画面で 1 回直せば既存の `TypeRule`（型シグネチャ → 型の記憶, `models.ts:TypeRule`）に学習されて以後自動になるが、**見出しだけは学習経路が無い**ことが今回の痛点だった。

到達点: 名前だけの改称が起きても、(1) 見出しは監督が設定画面に 1 行足せば復旧でき、(2) それ以外はレビュー画面の手修正 1 回で復旧し、(3) アプリ側の修正が要る場合も編集箇所が 1 ファイルに閉じる。

---

## 作業ツリーの現状

前段の調査で以下 3 箇所を**暫定修正済み（未コミット）**。本プランはこれを土台に構造化する。

- `app/src/logic/programs.ts`: `LOCAL_NEEDS_RE = /会衆の?必要|会衆で考えたいこと/` を追加、living 判定 2 箇所を差し替え
- `app/src/excel/import.ts:111`: `/野外奉仕に励む|伝道を楽しもう/`
- `app/src/pdf/import.ts:100`: 同上

---

## 実装

### 1. マスタ型の追加 — `app/src/models.ts`

```ts
/** セクション見出しの別名（マスタ）。ワークブックの改称に追従するため利用者が追加できる */
export interface SectionAlias {
  id: string;
  keyword: string;  // 部分一致（正規表現ではなく単純一致。利用者入力を安全に扱う）
  section: Exclude<Section, null>;
  builtin: boolean; // 既定分。削除不可・migrate で補充
}
```

`AppData` に `sectionAliases: SectionAlias[]` を追加（`models.ts:110` 付近の `typeRules` / `nameAliases` に並べる）。

### 2. 既定値と移行 — `app/src/state.ts`

- `defaultData()` に `sectionAliases` を追加。既定 4 件（安定 id で固定）
  - `sa_treasures`: 神の言葉の宝 → treasures
  - `sa_ministry_old`: 野外奉仕に励む → ministry
  - `sa_ministry_new`: 伝道を楽しもう → ministry
  - `sa_living`: クリスチャンとして生活する → living
- `migrate()` に冪等マージを追加: `builtin` の既定 id が欠けていれば補う。利用者の追加分・並びは保持
- **`migrate` を `export` する**（次項の復元経路で使う）

### 3. 復元経路の穴を塞ぐ — `app/src/views/settings.ts:69`

現状の復元は `Object.assign(d, parsed)` のみで `migrate()` を通らない。このためバックアップ取得後に `defaultData()` へ追加した既定別名が、古いバックアップを復元した時点で失われる。

```ts
Object.assign(d, migrate(parsed));
```

に変更（`state.ts` から `migrate` を import）。バックアップ本体は `JSON.stringify(d)`（`settings.ts:48`）で AppData 全体を書き出すため、`sectionAliases` は追加するだけで書き出し・復元の対象になる。

### 4. 見出し判定の共通化 — `app/src/logic/programs.ts`

`excel/import.ts:sectionHeading` と `pdf/import.ts:sectionOf` に重複している判定を 1 つにまとめる。

```ts
export function sectionFromHeading(text: string, aliases: SectionAlias[]): Section | undefined
```

- `aliases` を順に走査し `text.includes(keyword)` で最初に一致したものの `section` を返す
- 一致なしは `undefined`（現行と同じセマンティクス）

### 5. 名前依存の別名テーブル集約 — `app/src/logic/programs.ts`

`detectByKeywords` に散在する正規表現を 1 つのテーブルに集める。改称時の編集箇所をここだけにするのが目的で、**判定の振る舞いは変えない**（`会衆で考えたいこと` の追加を除く）。

```ts
/**
 * プログラム名の別名テーブル。ワークブックの改称はここだけを直せばよい。
 * 番号ルール（part1-8）で判別できる項目は改称の影響を受けにくいが、
 * 番号が無い書式でも拾えるよう従来どおり併用する。
 */
const NAME_ALIAS = {
  localNeeds:   /会衆の?必要|会衆で考えたいこと/,
  cbs:          /会衆の?聖書研究/,
  serviceTalk:  /奉仕の話/,
  bibleReading: /聖書朗読/,
  gems:         /宝石/,
  openingWords: /開会のことば|開会の言葉/,
  closingWords: /閉会のことば|閉会の言葉/,
  prayer:       /祈り/,
} as const;
```

暫定修正で入れた `LOCAL_NEEDS_RE` はこれに吸収する。

### 6. 呼び出しの配線

- `excel/import.ts`: `parseWorkbook(data, typeRules)` → `parseWorkbook(data, appData: AppData)` に変更し、内部で `appData.typeRules` / `appData.sectionAliases` を使う。`pdf/import.ts:parseHistoryLines(lines, data: AppData)` が既に AppData を受け取る形なので、そちらに合わせる
  - 呼び出し元は `views/importExcel.ts:59` の 1 箇所のみ
  - `extractWorkbookDates` は日付しか見ないため変更なし
- `pdf/import.ts`: ローカルの `sectionOf` を削除し `sectionFromHeading(line, data.sectionAliases)` に置換。`extractHistoryFromPdf` / `parseHistoryLines` のシグネチャは**変更不要**（`views/importHistory.ts:86` も無改修）

### 7. 表示ラベルの新称化

| 場所 | 旧 | 新 |
|---|---|---|
| `programs.ts` `TYPE_DEFS.ministry_talk.label` | 野外奉仕に励む：話 | 伝道を楽しもう：話 |
| `programs.ts` `TYPE_DEFS.ministry_demo.label` | 野外奉仕に励む：実演 | 伝道を楽しもう：実演 |
| `programs.ts` `TYPE_DEFS.local_needs.label` | クリスチャンとして生活する：会衆の必要 | クリスチャンとして生活する：会衆で考えたいこと |
| `programs.ts` `TYPE_DEFS.local_needs` スロット label | 会衆の必要 | 会衆で考えたいこと |
| `programs.ts` `LEGACY_TYPE_DEFS` の demo4/5/6 label | 野外奉仕に励む：… | 伝道を楽しもう：… |
| `views/assign.ts:12` `SECTION_TITLES.ministry` | 野外奉仕に励む | 伝道を楽しもう |

**ロール名（`state.ts` `defaultData().roles`）は対象外** — 利用者が役割画面で自由に変更でき、`ROLE_RENAMES` の既定値追従機構と干渉するため。

**スロット label は取り込み時に各集会へ焼き付く**（`buildProgram` が `{...s}` でコピー）ため、既存データは旧ラベルのまま残る。`state.ts:124` の「祈りの表示名を型ラベルに揃える」処理と同じ形で、`migrate()` に**スロット label を `typeDef` から再同期する冪等処理**を追加する（`roleId` は触らない）。

### 8. 設定画面に編集 UI — `app/src/views/settings.ts`

「バックアップ・設定」に `<h2>セクション見出しの別名</h2>` パネルを追加（保存状態と手動バックアップの間）。

- 表: 見出し語 / セクション / 操作。`builtin` は削除ボタン非表示
- 追加フォーム: テキスト入力 + セクション選択（神の言葉の宝 / 伝道を楽しもう / クリスチャンとして生活する）+ 追加ボタン
- 追加・削除ごとに `ctx.persist()`
- 説明文: 「ワークブックのセクション見出しの呼び方が変わったとき、ここに新しい呼び方を追加すると取り込みが再び正しく動きます」
- 重複キーワードは追加時に弾く

---

## 検証

1. **ビルド**: `cd app && npm run build`（`tsc` + esbuild）が無警告で通ること
2. **実ファイル回帰**（スクラッチパッドで esbuild → node 実行、`global.window = {ExcelJS: require("exceljs")}` を注入して `parseWorkbook` を直接叩く。前段調査で確立済みの手順）
   - `G:\マイドライブ\jw.org\徳山会衆\週日の集会割当\2026年11-12月\2026年11-12月.xlsx` → 8 集会日・**未分類 0 件**、part7 が `local_needs`（`会衆で考えたいこと` の週）
   - `…\2026年9-10月\2026年9-10月.xlsx` → 8 集会日・未分類 0 件（新旧見出しが混在するファイル）
   - `…\2025年11-12月\*.xlsx` → 旧見出しのみのファイルで回帰が無いこと
   - `sectionAliases` を**空配列**にして実行 → 見出し検出が落ちること（マスタが実際に効いていることの確認）
3. **手動**: `run.cmd` で dev 起動
   - 設定画面 → 別名を 1 件追加 → 削除（既定分に削除ボタンが出ないこと）
   - Excel 取り込み → レビュー画面のラベルが新称になっていること
   - 割当画面 → セクション見出しが「伝道を楽しもう」、part7 のスロット名が「会衆で考えたいこと」
   - **既存データの再同期確認**: 修正前のバージョンで取り込んだ集会を開き、スロット label が新称に更新されていること
   - バックアップ書き出し → 別名を 1 件足す → そのバックアップを復元 → 追加分が消え、既定分が残ること（`migrate` 経由の確認）

---

## 影響範囲

変更ファイル 6: `models.ts` / `state.ts` / `logic/programs.ts` / `excel/import.ts` / `pdf/import.ts` / `views/settings.ts`（+ `views/assign.ts` の 1 行、`views/importExcel.ts` の呼び出し 1 行）。概算 150〜180 行。テストフレームワークは本リポジトリに存在しないため、検証は上記 2 のスクリプト実行と 3 の手動確認で行う。

## 学校監督への引き継ぎ（リリース後）

1. 新しいインストーラで上書きインストール（データは `AppData\Roaming` 側のため消えない）
2. 2026 年 9-10 月（9/11 週以降）と 11-12 月を **Excel から再取り込み**。「取込済み — 確定すると上書き」の表示が出るので確定する
3. 再取り込みで伝道パート（4-6）と part7 の検出結果が変わるため、**その週の割当は消える**。取り込み後に割り当て直しが必要
4. レビュー画面で過去に手修正した記憶（`TypeRule`）が自動判定より優先される。種類が意図と違えばその場で選び直す（記憶が上書きされる）
5. 今後ワークブックのセクション見出しの呼び方が変わったら、**設定画面の「セクション見出しの別名」に追加するだけ**でアプリ更新は不要

---

## 追記（2026-09-15）: プログラム名もマスタ化した

当初はプログラム名の別名をコード内の `NAME_ALIAS` テーブルに集約するに留めた
（見出しと違い `TypeRule` で学習できるため）。しかし改称が今後も頻繁に起こる
見込みであることから、セクション見出しと同じくデータ化した。

- `AppData.typeKeywords`（`{id, keyword, target, builtin}`）を追加
- `logic/programs.ts` の `NAME_ALIAS`（正規表現）を `KEYWORD_TARGETS`（当て先の
  一覧と表示名）＋ `hits()`（部分一致）に置き換え。判定の順序・条件は不変
- `detectType(cText, eLabel, typeRules, section)` → `detectType(cText, eLabel, data, section)`
- 設定画面を「対象1行にその呼び方を chip で並べる」形に作り直した。旧版は
  「呼び方 / セクション」の2列だったため、`野外奉仕に励む → 伝道を楽しもう` と
  `伝道を楽しもう → 伝道を楽しもう` が別行に並び、同じ語が二重に見えていた。
  区分は `SECTION_GROUP`（宝 part1-3 / 伝道 part4-6 / 生活 part7-8）で表示し、
  ワークブックの呼び方と混ざらないようにした
