# cao-holidays 仕様

内閣府公式の祝日CSVをfetch・パースして返す薄いNode.jsライブラリ + CLI。

> **このドキュメントの位置付け**: `packages/js/` に格納されている JS / TypeScript パッケージ (npm: `cao-holidays`) の仕様書。monorepo 全体の構造（言語横断の `fixtures/`、各 `packages/<lang>/` の配置）は [`monorepo-structure.md`](./monorepo-structure.md) を、各言語のリリース手順は [`release-runbook.md`](./release-runbook.md) を参照。
>
> 他言語（Python / Go / Ruby / Rust / PHP）の実装は本仕様の API / CLI 振る舞い・出力フォーマットと一致させ、`fixtures/` のスナップショットでバイト一致を担保する。

---

## 設計思想

「内閣府CSVをfetch → パース → 型付きで返す」だけを行う薄いラッパー。判定ロジック（営業日計算、土日との関係など）は持たない。

---

## スコープ

- **ライブラリ**: `import { fetchHolidaysByYear } from 'cao-holidays'`
- **CLI**: `npx cao-holidays 2026 > holidays.csv`

両方を1パッケージで提供する。CLIはライブラリの薄い層。

---

## ターゲットランタイム

- **公式サポート**: Node.js LTS（現行 22 / 24）
- **未検証（将来対応候補）**: Bun / Deno / Cloudflare Workers / ブラウザ
  - ライブラリ本体（`packages/js/src/`）は Node 固有 API（`fs`, `path`, `process` 等）を使わない方針で書く（CLIエントリ `packages/js/bin/` は当然 Node 固有を使う）
  - 上記方針が守られていれば各ランタイムでも動作する見込みはあるが、現時点で検証していない。`TextDecoder('shift_jis')` の対応状況などはランタイムごとに確認が必要
  - ブラウザは内閣府サーバが CORS ヘッダを返さないため、プロキシ経由 or `fetch` DI 前提

---

## データソース

内閣府の祝日CSV。URLは **デジタル庁オープンデータカタログ（CKAN）の `package_show` API** で取得する。

```
https://data.e-gov.go.jp/data/api/action/package_show?id=cao_20190522_0002
```

返却JSONの `resources[].url` を CSV 実URLとして使う。

- 文字コード: Shift_JIS
- フォーマット: 2カラム（日付, 名称）。先頭行はヘッダー（`国民の祝日・休日月日,国民の祝日・休日名称`）— パーサーで必ずスキップする
- 日付形式: `YYYY/M/D`（ゼロ埋めなし、スラッシュ区切り）。ライブラリは内部で `YYYY-MM-DD` に正規化して返す
- ソート順: 昇順
- 収録範囲: 1955年〜翌年（毎年2月頃に更新）

> **注**: CKAN 側のメタデータは 2022-08-17 から更新が止まっている（2026-05 時点で確認、`resource.name` のテキストは「〜令和2年（2020年）」のまま）。`resource.url` の値は現時点では維持されているが、内閣府がファイル名を変更した場合に CKAN 側が追従するかは保証されない。
>
> **CKAN 障害時の方針**: CKAN 取得失敗時は `https://www8.cao.go.jp/chosei/shukujitsu/syukujitsu.csv` を直叩きするフォールバックを持つ予定（2026-05 時点では未実装、CKAN のみ）。週次 healthcheck workflow は CKAN / 直URL の両方を実取得して issue 化するので、フォールバックが必要なほど CKAN が壊れた時点で検知できる。

---

## SJISデコード

**`TextDecoder('shift_jis')`** を使用（zero-dep）。

```ts
const buf = await (await fetch(url)).arrayBuffer();
const text = new TextDecoder('shift_jis').decode(buf);
```

公式 Node 配布は full-icu なので大半の環境で動く。Alpine 等の最小 Node イメージで詰むケースが報告されたら、その時 `iconv-lite` を optional 化する。

---

## ライブラリ API

### 型

```ts
type Holiday = {
  date: string;  // 'YYYY-MM-DD' (JST)
  name: string;  // 内閣府の名称をそのまま (例: '元日')
};

type FetchOptions = {
  signal?: AbortSignal;          // fetchのキャンセル
  fetch?: typeof fetch;          // DI用 (テスト・プロキシ・CORS回避)
};

class CaoHolidaysError extends Error {
  readonly code: 'INVALID_INPUT' | 'OUT_OF_RANGE' | 'FETCH_FAILED' | 'PARSE_FAILED';
  constructor(code: CaoHolidaysError['code'], message: string, options?: { cause?: unknown });
}
```

### 関数

```ts
// 全件取得（CSV収録の全期間）
// Throws: CaoHolidaysError(FETCH_FAILED | PARSE_FAILED)
fetchAllHolidays(options?: FetchOptions): Promise<Holiday[]>

// 年指定
// Throws: CaoHolidaysError(INVALID_INPUT | OUT_OF_RANGE | FETCH_FAILED | PARSE_FAILED)
fetchHolidaysByYear(year: number, options?: FetchOptions): Promise<Holiday[]>

// 期間指定（両端含む）
// Throws: CaoHolidaysError(INVALID_INPUT | OUT_OF_RANGE | FETCH_FAILED | PARSE_FAILED)
fetchHolidaysBetween(
  from: Date | string,
  to: Date | string,
  options?: FetchOptions
): Promise<Holiday[]>
```

### タイムゾーン

すべての日付は **JST 固定**で扱う。比較は `YYYY-MM-DD` 文字列として行い、タイムゾーンを跨ぐ計算はしない。

- `string` 入力: `YYYY-MM-DD` 形式のみ受け付ける（それ以外は `INVALID_INPUT` で例外）
- `Date` 入力: `Date` を JST の `YYYY-MM-DD` に正規化してから比較。実行環境のローカルタイムゾーンに依存しない
- 正規化の実装例: `new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)` で `YYYY-MM-DD` を得る（`en-CA` は ISO 8601 拡張形式を返すロケールの定番）

### 入力バリデーション

不正入力は `CaoHolidaysError` を投げる。

- `fetchHolidaysByYear`:
  - `Number.isSafeInteger(year) === false` または `year < 0` → `INVALID_INPUT`（fetch 前に判定）
  - fetch 後、CSV に該当年の祝日が1件もない場合 → `OUT_OF_RANGE`
- `fetchHolidaysBetween`:
  - `from` / `to` が `Date | string` 以外、または string が `YYYY-MM-DD` 違反 → `INVALID_INPUT`
  - `from > to` → `INVALID_INPUT`（比較は両方を JST の `YYYY-MM-DD` 文字列に正規化してから文字列比較）
  - `from` の年〜`to` の年のすべてが CSV に存在しない場合 → `OUT_OF_RANGE`
  - 含まれる年のいずれかが CSV にあれば、たとえ該当期間の祝日が0件でも空配列を返す（祝日の無い期間は正常）

> 上限・下限を実行時の `Date` でハードコードせず、CSV の実データに任せる方針。CSV が更新されれば自動で扱える年が広がる。

### 振る舞い

- **戻り値は常に日付昇順**（CSVのソート順変更に依存しない）
- **キャッシュなし**: 呼ぶたびに毎回 fetch。複数年が必要なら `fetchHolidaysBetween` か `fetchAllHolidays` を1回呼ぶ方が効率的（README で誘導）
- **エラー**: fetch 失敗 → `FETCH_FAILED`、パース失敗 → `PARSE_FAILED`。元の例外は `cause` プロパティに保持する
- **リトライ**: ライブラリ層は持たない（外側で `FetchOptions.fetch` を被せて自前実装可能）。CLI 層は `--retry` で指数バックオフ + ジッタを行う（CLI セクション参照）
- **AbortSignal**: `signal.aborted` で取り消された場合も `CaoHolidaysError(FETCH_FAILED)` にラップして投げる（`cause` に元の `DOMException(AbortError)` を入れる）
- **判定系API（`isHoliday` 等）は提供しない**: 取得結果を `Set` に入れれば済むため
- **HTTP**: 内閣府サーバへの礼儀として `User-Agent: cao-holidays/<version>` を付与（`<version>` は packages/js/package.json の version を JSON import で参照）

### `FetchOptions.fetch` の用途

- テスト: ネットワークを叩かずモック可能
- プロキシ・認証付き環境: 独自 `fetch` を差し込み
- ブラウザCORS回避: 自前プロキシエンドポイントに向ける
- 外側でキャッシュ層を被せる

---

## CLI

```
cao-holidays [<year>|<year>..<year>|<from>..<to>] [--format <csv|json|ics>] [--all]
             [--timeout <ms>] [--retry <n>] [--retry-delay <ms>]
cao-holidays --help | --version
```

### 引数

| 形式 | 例 | 取得範囲 |
|---|---|---|
| なし | `cao-holidays` | 今年の祝日 |
| `<year>` | `cao-holidays 2026` | その年の祝日 |
| `<year>..<year>` | `cao-holidays 2025..2027` | 年範囲（両端含む） |
| `<from>..<to>` | `cao-holidays 2025-04-01..2026-03-31` | 日付範囲（両端含む） |

- 日付は ISO 8601 拡張形式 `YYYY-MM-DD` のみ受け付ける
- ライブラリ関数への振り分け:
  - 位置引数 `<year>` → `fetchHolidaysByYear(year)`
  - 位置引数 `<year>..<year>` → `fetchHolidaysBetween('YYYY-01-01', 'YYYY-12-31')` に展開
  - 位置引数 `<from>..<to>` → `fetchHolidaysBetween(from, to)`
  - 位置引数なし + `--all` → `fetchAllHolidays()`
  - 位置引数なし + `--all` なし → `fetchHolidaysByYear(currentYear)`（`currentYear` は **JST** で取得: `Number(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo', year: 'numeric' }).format(new Date()))` で number 化）
- 位置引数の形式が上記いずれにもマッチしない場合（複数指定、`2026/1/1`、`2025..2027-01-01` のような混合パターン等）は INVALID_INPUT 扱いで stderr 警告 + exit 1

### オプション

| オプション | デフォルト | 説明 |
|---|---|---|
| `--format <fmt>` | `csv` | 出力形式: `csv` \| `json` \| `ics` |
| `--all` | `false` | CSV収録の全期間（位置引数と同時指定時は INVALID_INPUT 扱いで stderr 警告 + exit 1） |
| `--timeout <ms>` | `30000` | **per-attempt** fetch タイムアウト（ミリ秒）。CLI 内部で `AbortSignal.timeout(ms)` を生成して `FetchOptions.signal` に渡す。`--retry` を併用した場合は試行ごとに新しい `AbortSignal.timeout` を作る。超過時は `FETCH_FAILED` → exit 2。`<ms>` が非整数 / 負数 / NaN は INVALID_INPUT 扱いで stderr 警告 + exit 1 |
| `--retry <n>` | `2` | 指数バックオフ + ジッタによる再試行回数（**初回 fetch は含まない**追加試行回数）。`0` で再試行を無効化。対象は HTTP 5xx / 408 / 429 / ネットワーク失敗 (`TypeError`) / `AbortError` / `TimeoutError` のみ。それ以外の 4xx と `PARSE_FAILED` / `INVALID_INPUT` / `OUT_OF_RANGE` は再試行しない。`Retry-After` ヘッダがあれば優先する。`<n>` が非整数 / 負数 / NaN は INVALID_INPUT 扱いで stderr 警告 + exit 1 |
| `--retry-delay <ms>` | `500` | 初回バックオフのベース（ミリ秒）。実際の待ち時間は `base * 2^attempt` に ±20% のジッタ（`Retry-After` ヘッダがあれば優先）。`<ms>` が非整数 / 負数 / NaN は INVALID_INPUT 扱いで stderr 警告 + exit 1 |
| `--help`, `-h` | - | ヘルプ表示 |
| `--version` | - | バージョン表示 |

> **短縮オプションの方針**: `-h` のみ採用。`-v` 系は version か verbose か曖昧なため採用しない（`--version` の長形式のみ）。

> **政府サーバへの配慮**: `--retry` のデフォルトを 2 にしたのは「ネットワーク瞬断に追従するが、上流の障害を肩代わりしない」バランス。`--retry` を増やしても解決しない継続障害には設定値を上げず、上流の停止を疑ってしばらく待つようにする。

### 終了コード

| コード | 意味 | 対応する `CaoHolidaysError.code` |
|---|---|---|
| 0 | 成功 | - |
| 1 | 不正な引数 / 入力検証失敗 | `INVALID_INPUT`, `OUT_OF_RANGE` |
| 2 | fetch 失敗 / パース失敗 | `FETCH_FAILED`, `PARSE_FAILED` |

エラーメッセージは stderr に出力。

### 出力例

**CSV（デフォルト）** — RFC 4180 準拠、ヘッダー行あり
```
date,name
2026-01-01,元日
2026-01-12,成人の日
```

`name` に `,` `"` 改行を含む場合は `"` で囲み、内部の `"` は `""` にエスケープする。

**JSON**
```json
[{"date":"2026-01-01","name":"元日"},{"date":"2026-01-12","name":"成人の日"}]
```

**ICS** — RFC 5545 形式の `VCALENDAR`。各祝日を全日 `VEVENT` として出力。

```ics
BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//aromarious//cao-holidays//JP
BEGIN:VEVENT
UID:2026-01-01@cao-holidays
DTSTART;VALUE=DATE:20260101
DTEND;VALUE=DATE:20260102
SUMMARY:元日
END:VEVENT
END:VCALENDAR
```

`DTEND` は exclusive（翌日を指定）。RFC 5545 の全日イベントの慣習に従う。

> **整形オプション**: `--no-header`（CSV）/ `--pretty`（JSON）等の整形オプションは持たない。ヘッダー必須・JSON は1行で出す。整形が必要な場合はパイプで `| jq .` 等を利用。

### 実装

`packages/js/bin/cao-holidays.ts` 1ファイル。ライブラリ関数を呼び、フォーマッタに渡すだけの薄い層。

---

## パッケージ構成

JS パッケージは `packages/js/` 配下で完結（公開する code は packages/js/）し、root の `fixtures/` `scripts/` `docs/` は言語横断の共有資産。pnpm workspace 化されており、`pnpm-lock.yaml` と `.changeset/` は root に置く（後者は `changesets/action@v1` の cwd バグ回避）。

```
cao-holidays/                       # repo root（multi-language monorepo + pnpm workspace）
├── package.json                    # workspace root metadata（private、deps なし、name = cao-holidays-monorepo）
├── pnpm-workspace.yaml             # packages: ['packages/js']
├── pnpm-lock.yaml                  # workspace lockfile
├── .changeset/                     # Changesets 設定 + 未消費 changeset (root に置くのは action 互換性のため)
├── packages/
│   └── js/                         # JS パッケージ本体 (npm: cao-holidays)
│       ├── src/
│       │   ├── index.ts            # ライブラリエントリ (fetch* 関数, 型, エラー)
│       │   ├── parse.ts            # CSV パーサ
│       │   ├── source.ts           # CKAN API でURL解決 + fetch
│       │   ├── format.ts           # CSV/JSON/ICS フォーマッタ (CLI共有)
│       │   ├── retry.ts            # CLI のリトライ層 (ライブラリ層は使わない)
│       │   └── cli.ts              # CLI ロジック (引数パース・振り分け・stdout/stderr)
│       ├── bin/
│       │   └── cao-holidays.ts     # CLI エントリ (shebang 必須、cli.ts の薄いラッパー)
│       ├── tests/                  # テストは tests/ に集約（src 隣接にはしない）
│       │   └── *.test.ts           # 入力 fixture は ../../../fixtures/ から相対参照
│       ├── package.json            # 公開対象 (npm: cao-holidays)
│       ├── tsconfig.json
│       ├── biome.json              # vcs.root: "../.." で repo root の .gitignore を利用
│       ├── tsup.config.ts
│       ├── vitest.config.ts
│       ├── CHANGELOG.md
│       ├── LICENSE                 # root の LICENSE のコピー（npm tarball 同梱用）
│       ├── README.md / README.en.md
│       └── dist/                   # gitignore (tsup 出力)
├── fixtures/                       # 言語横断の入力 + 期待出力スナップショット
│   ├── syukujitsu.csv              # 内閣府CSVの本物コピー (SJISのまま)
│   ├── all.json / 2026.json / 2025-2027.json / range-*.json
│   ├── 2026.csv / 2026.ics
│   └── README.md
├── scripts/                        # maintainer 専用、publish 対象外
│   ├── sync-fixture.mjs            # 内閣府の最新 CSV を fixtures/syukujitsu.csv に同期
│   └── generate-fixtures.mjs       # JS 実装の run() で期待出力を再生成
├── docs/
│   ├── spec.md                     # JS パッケージ仕様（このファイル）
│   ├── monorepo-structure.md       # 全体ディレクトリ設計
│   ├── release-runbook.md          # 各言語のリリース手順
│   └── research.md
├── Makefile                        # 横断開発タスク (lint / format / test / sync-fixture / generate-fixtures)
├── README.md / README.en.md        # monorepo overview（各 package へのリンク）
├── LICENSE / SECURITY.md / CONTRIBUTING.md / CODE_OF_CONDUCT.md
└── .github/                        # workflows (ci-js.yml / release.yml / codeql.yml / healthcheck.yml) と templates
```

### `packages/js/package.json` 要点

```json
{
  "type": "module",
  "engines": { "node": ">=22" },
  "exports": {
    ".": { "import": "./dist/index.js", "types": "./dist/index.d.ts" }
  },
  "bin": { "cao-holidays": "./dist/bin/cao-holidays.js" },
  "scripts": {
    "build": "tsup",
    "test": "vitest run",
    "typecheck": "tsc --noEmit",
    "lint": "biome check .",
    "sync-fixture": "node ../../scripts/sync-fixture.mjs",
    "prepublishOnly": "pnpm build"
  }
}
```

ESM。型定義同梱。CJS互換は当面なし（必要になれば `tsup` 等でdual出力）。

`bin` のビルド出力は `#!/usr/bin/env node` shebang を先頭に付ける（tsup の `banner` か該当オプションで対応）。

`sync-fixture` スクリプトは root の `scripts/sync-fixture.mjs` を相対パスで呼ぶ（fixture は言語横断の共有資産で、JS パッケージ固有ではないため root に置く）。`make sync-fixture` でも実行できる。

---

## ブランチ戦略

[GitHub Flow](https://docs.github.com/en/get-started/quickstart/github-flow) を採用。

- `main`: 常にデプロイ（npm publish）可能な状態を保つ
- `feature/*`（または `fix/*`, `chore/*` など用途プレフィックス）: `main` から切って作業
- 各ブランチは PR を経由して `main` にマージ。直 push しない
- マージ後はブランチを削除
- リリースは [changesets](https://github.com/changesets/changesets) の Release PR マージ契機（CI セクション参照）

> ぐるなびの [GitFeatureFlow](https://developers.gnavi.co.jp/entry/GitFeatureFlow/koyama) からインスパイアされたが、テスト/ステージング環境を持たないため `test-env` / `stg-env` ブランチは作らず、CI に検証を集約する形（実質 GitHub Flow と同じ）。

---

## テスト戦略

| 項目 | 方針 |
|---|---|
| ランナー | Vitest |
| ネットワーク | 全テストでモック（`FetchOptions.fetch` 経由）。実通信はCIの定期ヘルスチェックに集約（詳細は CI セクション） |
| 入力フィクスチャ | 内閣府CSVの本物コピー（SJISのまま） を repo root の `fixtures/syukujitsu.csv` に配置（言語横断の共有）。**スナップショット固定** で運用し、CI 定期ヘルスチェックが差分を検知したら手動更新スクリプト `make sync-fixture` (= `node scripts/sync-fixture.mjs`) で更新（PR を作って差分を明示してマージ） |
| 期待出力フィクスチャ | `fixtures/{all,2026,2025-2027,range-2026-04-01_2026-05-31}.json` + `2026.csv` + `2026.ics`。JS 実装の CLI `run()` を fake fetch で叩いて生成（`make generate-fixtures` = `node --import tsx ../../scripts/generate-fixtures.mjs`）。他言語実装はこの出力と**バイト一致**することで振る舞いの同一性を担保する |
| カバー対象 | パーサー（ヘッダー行スキップ含む） / CKAN URL解決 / `fetchAllHolidays`・`fetchHolidaysByYear`・`fetchHolidaysBetween` / フォーマッタ / CLI / リトライ層 (CLI でのみ使用)。現状 100 件のテストで全関数を網羅 |
| カバレッジ | vitest coverage で計測のみ。閾値による CI 失敗はしない |

---

## CI / リリース運用

| 項目 | 方針 |
|---|---|
| ホスティング | GitHub Actions |
| Node マトリクス | 22 / 24（Node 26 が Active LTS 入りしたら追加検討） |
| OS マトリクス | Ubuntu のみ |
| PR チェック | workflow `ci-js.yml`（`paths` フィルタで `packages/js/**`・`fixtures/**`・`scripts/sync-fixture.mjs`・`scripts/generate-fixtures.mjs` の変更時のみ起動）。中身は `biome check .` / `vitest run` / `tsc --noEmit` / `tsup` build / dist bin smoke test (`node dist/bin/cao-holidays.js --version`) / `publint` + `@arethetypeswrong/cli`、`working-directory: ./packages/js` で実行 |
| 定期ヘルスチェック | 週次cronで (a) CKAN 経由 と (b) 直URL `https://www8.cao.go.jp/chosei/shukujitsu/syukujitsu.csv` の両方を実取得。各CSVのSHA-256ハッシュを `.healthcheck/state.json` に保存し、前回と差分があれば issue 自動起票（更新日 / 行数 / フォーマット変化、(a)(b) の不一致を検知）。実装は curl + jq ベースで言語非依存 |
| リリース管理 | [changesets](https://github.com/changesets/changesets)。`.changeset/*.md` (repo root) に changeset を追加 → main マージで Release PR 自動作成 → Release PR マージで自動 publish。`changesets/action@v1` の `cwd:` パラメータが `readChangesetState` に伝わらないバグ（fix は main 未リリース）回避のため、`.changeset/` は root に置き、`pnpm-workspace.yaml` で packages/js を workspace member として宣言する。workflow `release.yml` の version/publish スクリプトは `pnpm --dir packages/js exec changeset (version|publish)` |
| npm 認証 | OIDC (npm Trusted Publisher: `aromarious/cao-holidays/release.yml`)。`NPM_TOKEN` は使わない。multi-language 化で `release-js.yml` に rename する場合は npm Trusted Publisher の workflow filename 設定も同期更新が必要 |

---

## セキュリティ

| 項目 | 方針 |
|---|---|
| GitHub Code security 機能 | Dependabot alerts / Dependabot security updates / Dependabot malware alerts / Secret Protection / Push protection / Private vulnerability reporting / Grouped security updates / Copilot Autofix をすべて ON |
| Dependabot 構成 | `.github/dependabot.yml` で npm（週次、devDependencies はグループ化）と github-actions（週次、別ジョブ）の自動更新 PR |
| CodeQL | `.github/workflows/codeql.yml` で TS/JS を push / PR / 週次 cron で scan。クエリスイートは `security-and-quality`。`.github/codeql/codeql-config.yml` で `scripts/**` を除外（maintainer 専用ツールで data-flow ルールに必ず引っかかるため） |
| 脆弱性報告 | `SECURITY.md` で [GitHub Private Vulnerability Reporting](https://github.com/aromarious/cao-holidays/security/advisories/new) に誘導。サポート対象（最新 minor のみ）/ scope / SLA を明記 |
| Action pin 方針 | major tag pin（`@v6` 等）。Dependabot が major bump 時に PR を打つ。SHA pin はオーバーキルとして採用しない（小規模 OSS のため） |
| Workflow permissions | リポジトリ デフォルトは "Read repository contents and packages permissions"（最小権限）。"Allow GitHub Actions to create and approve pull requests" を ON（changesets/action の Release PR 作成のため） |
| npm publish 認証 | OIDC (Trusted Publisher: `aromarious/cao-holidays/release.yml`)。`NPM_TOKEN` secret は使わない。`publishConfig.provenance: true` で provenance も自動付与 |
| Healthcheck issue 起票 | 週次 cron が `data-changed` / `source-mismatch` (CKAN vs 直URL) / `fetch-failed` のいずれかを検知したら `healthcheck` ラベル付き issue を自動起票 |

---

## ビルド / Lint

| 項目 | 方針 |
|---|---|
| ビルド | `tsup`（esbuildベース、型定義同梱、bin に shebang 付与） |
| 出力形式 | ESMのみ |
| Lint / Format | Biome v2 系（現行 v2.4+。v1 とは設定スキーマ非互換）。`devDependencies` は `^2.4` で pin（minor/patch 自動追従、メジャー更新は手動） |
| TypeScript | `strict: true` + `noUncheckedIndexedAccess: true`、`target: ES2024`、`module: NodeNext`、`moduleResolution: NodeNext` |

---

## リポジトリ運用

| 項目 | 方針 |
|---|---|
| GitHubリポジトリ | [aromarious/cao-holidays](https://github.com/aromarious/cao-holidays) (public)。description / homepage / topics 設定済み |
| README | repo root の `README.md` / `README.en.md` は **monorepo overview**（package 一覧、quick start (JS) はリンク誘導、ディレクトリ構成、Makefile 紹介）。JS パッケージの詳細仕様（Install / Quick start (CLI) / Quick start (Library) / Caveats / Debug / Data source / Support）は `packages/js/README.md` / `README.en.md` 側にあり、npm tarball にもこれが同梱される。両 README とも日本語 / 英語の2本、互いにリンク。冒頭に badges (npm / CI / Node / License) |
| LICENSE | MIT。`LICENSE` ファイルは repo root と `packages/js/LICENSE` の両方に配置（後者は npm tarball 同梱用のコピー） |
| CONTRIBUTING / CoC | `CONTRIBUTING.md`（dev setup / branch / commit / changeset / 言語ポリシー）と `CODE_OF_CONDUCT.md` (Contributor Covenant v2.1) を配置 |
| Issue / PR テンプレ | `.github/ISSUE_TEMPLATE/{bug_report,feature_request}.yml` + `config.yml`（blank issue 禁止、SECURITY/README への contact link）+ `.github/pull_request_template.md` |
| データライセンス | 内閣府CSVは日本政府のオープンデータポリシー（現行: [公共データ利用規約 第1.0版](https://www.digital.go.jp/resources/open_data)、2024-07-05〜）に従う。[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) 互換。READMEに帰属表記例を掲載:<br>「祝日データ出典: 内閣府『国民の祝日について』(https://www8.cao.go.jp/chosei/shukujitsu/gaiyou.html) を [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) のもとで利用」 |

---

## ガバナンス

| 項目 | 方針 |
|---|---|
| ブランチ保護 | GitHub Rulesets で `main` を保護。PR 必須（required approvals: 0、solo maintainer）/ linear history / force push 禁止 / deletion 禁止 / 必須 status check は `CI (JS) / Build & test (Node 22)` `CI (JS) / Build & test (Node 24)` と `CodeQL / Analyze (javascript-typescript)`。Python 等を追加する際は `CI (Python) / ...` 等を追加していく。CI workflow rename / monorepo 移行のように status check 名が変わる場合は、merge 前に ruleset を一旦緩めて新名で再設定する手順を取る |
| 開発フロー | `feature/*` / `fix/*` / `chore/*` ブランチで作業 → PR → squash or rebase で `main` にマージ |
| リリースフロー | changesets を `pnpm exec changeset` で添付 → main マージで Release PR 自動作成 → Release PR マージで自動 npm publish (OIDC) |
| 言語ポリシー | PR / Issue のタイトル・本文は **日本語**。コミットメッセージと `README.en.md` は **英語**。CONTRIBUTING.md / CODE_OF_CONDUCT.md などのコミュニティドキュメントは目的に応じて選択（CONTRIBUTING は日本語、CoC は Contributor Covenant 原文の英語） |
| コーディング規約 | TypeScript `strict: true` + `noUncheckedIndexedAccess: true`、Biome v2 で format/lint、セミコロン無し（`asNeeded`）、すべての export に日本語 JSDoc |
| Issue / PR テンプレ | `.github/ISSUE_TEMPLATE/{bug_report,feature_request}.yml` + `config.yml`（blank issue 禁止 + SECURITY/README への contact link）。`.github/pull_request_template.md` で changeset 添付 / breaking change チェックを促す |
| Code of Conduct | [Contributor Covenant v2.1](./CODE_OF_CONDUCT.md)。enforcement contact は `aromarious@gmail.com` |
| サポート対象 Node | LTS の現行 2 系統（22 / 24）を CI でテスト |

---

## その他

| 項目 | 方針 |
|---|---|
| examples/ | 作らない（READMEのQuick startで十分） |
| デバッグログ | `debug` パッケージを採用。スコープ名 `cao-holidays`。`DEBUG=cao-holidays` で有効化 |

---

## 非スコープ（明示的にやらないこと）

- 祝日判定API（`isHoliday`, `nextHoliday` 等）
- 営業日計算
- ディスクキャッシュ
- 静的データ埋め込み（オフライン動作）
- ライブラリ層のリトライ機構（CLI 層では `--retry` で指数バックオフ + ジッタを行う）
- ライブラリのタイムアウトデフォルト設定（CLI 層では `--timeout` で 30 秒デフォルトを設定する）
- 多言語対応（内閣府名称をそのまま返すのみ）

> **ライブラリ**側はリトライ・タイムアウトのデフォルトを持たない。利用者は `AbortSignal.timeout(ms)` を `FetchOptions.signal` に渡してタイムアウトを実現でき、リトライが必要なら `FetchOptions.fetch` を被せて自前で実装する。**CLI** 側は最終利用者の体験を優先し、`--timeout` 30000ms と `--retry` 2 をデフォルトに設定する（どちらも明示フラグで無効化 / 上書き可能）。
