# cao-holidays (JS)

> [English version](./README.en.md)
>
> 🗂 これは [`cao-holidays` multi-language monorepo](https://github.com/aromarious/cao-holidays) の **JavaScript / TypeScript パッケージ**です。他言語の実装計画と全体像は [repo root の README](https://github.com/aromarious/cao-holidays#readme) を参照してください。

[![npm](https://img.shields.io/npm/v/cao-holidays?style=flat-square)](https://www.npmjs.com/package/cao-holidays)
[![CI](https://img.shields.io/github/actions/workflow/status/aromarious/cao-holidays/ci-js.yml?branch=main&style=flat-square&label=CI)](https://github.com/aromarious/cao-holidays/actions/workflows/ci-js.yml)
[![Node](https://img.shields.io/node/v/cao-holidays?style=flat-square)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/npm/l/cao-holidays?style=flat-square)](./LICENSE)

内閣府が公開している『国民の祝日』CSV を実行時に fetch して、`Holiday[]` / CSV / JSON / ICS として返す Node.js ライブラリ + CLI です。

```sh
npx cao-holidays 2026
# date,name
# 2026-01-01,元日
# 2026-01-12,成人の日
# 2026-02-11,建国記念の日
# ...
```

### なぜ作ったか

既存の祝日ライブラリは大きく 2 系統あり、それぞれ弱点があります:

- **静的データ埋め込み式**（`@holiday-jp/holiday_jp` など最有名どころ）: 翌年の祝日や臨時祝日が入るのはパッケージ更新後
- **ルール計算式**（`japanese-holidays` ほか複数）: 祝日法改正や即位の礼のような臨時祝日に対応できません

本パッケージ `cao-holidays` は **内閣府 CSV を実行時に取得**することで両方の弱点を解消します。公的データが更新されれば、ライブラリ側のリリースを待たずに反映されます。

### 特徴

- データソースは [内閣府公式 CSV](https://www8.cao.go.jp/chosei/shukujitsu/gaiyou.html)。デジタル庁オープンデータカタログ (CKAN) `package_show` API で URL を動的解決
- 依存ゼロ（zero-dep、SJIS デコードは標準 `TextDecoder`）
- ESM only / Node.js 22+ / TypeScript 型定義同梱
- ライブラリ + CLI を1パッケージで提供
- 出力は CSV / JSON / ICS の3形式

### 想定する使い方

「祝日データを**取得する**」だけが責務です。リクエストごとに毎回呼ぶのではなく、**まとめて取得して自前のストア（DB、KV、メモリ、S3、ファイル）に置き、判定はそこから**、という前提で設計しています。

**例 1: CI で年1回 JSON を生成して配信**

```yml
# .github/workflows/holidays.yml
on:
  schedule: [{ cron: '0 0 5 2 *' }]  # 毎年2月5日 (内閣府の更新サイクル)
  workflow_dispatch: {}
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - run: npx cao-holidays --all --format json > holidays.json
      - run: aws s3 cp holidays.json s3://my-bucket/holidays.json
```

**例 2: アプリ起動時に1回取得してメモリで判定**

```ts
import { fetchAllHolidays } from 'cao-holidays'

const holidaySet = new Set((await fetchAllHolidays()).map((h) => h.date))

export function isHoliday(yyyyMmDd: string): boolean {
  return holidaySet.has(yyyyMmDd)
}
```

**例 3: ICS としてカレンダーに import**

```sh
npx cao-holidays --all --format ics > jp-holidays.ics
# → Google Calendar / Apple Calendar に import
```

**アンチパターン**: リクエストやイベント単位で fetch 系関数を呼ぶこと。毎回ネットワーク往復になり、内閣府サーバにも負荷をかけます。取得は1回、判定は自前ストアから、が基本です。

## インストール

```sh
npm install cao-holidays
# pnpm add cao-holidays
# yarn add cao-holidays
```

## クイックスタート (CLI)

```sh
# 引数なし → JST 今年の祝日（CSV、デフォルト）
npx cao-holidays

# 年指定
npx cao-holidays 2026

# 年範囲（両端含む）
npx cao-holidays 2025..2027

# 日付範囲（両端含む、ISO 8601 拡張形式 YYYY-MM-DD）
npx cao-holidays 2026-04-01..2026-05-31

# CSV 全件
npx cao-holidays --all

# JSON / ICS 出力
npx cao-holidays 2026 --format json
npx cao-holidays 2026 --format ics > 2026.ics

# fetch タイムアウト（per-attempt、デフォルト 30000ms） — Caveats: タイムアウト 参照
npx cao-holidays 2026 --timeout 5000

# リトライ（5xx / 408 / 429 / ネットワーク失敗のみ。デフォルト 2 回、初回遅延 500ms）
npx cao-holidays 2026 --retry 3 --retry-delay 1000
npx cao-holidays 2026 --retry 0          # リトライ無効化
```

### 終了コード

| コード | 意味 |
|---|---|
| 0 | 成功 |
| 1 | 不正な引数 / 入力検証失敗（`INVALID_INPUT`, `OUT_OF_RANGE`） |
| 2 | fetch 失敗 / パース失敗（`FETCH_FAILED`, `PARSE_FAILED`） |

エラーメッセージは stderr に出力されます。

## クイックスタート (ライブラリ)

```ts
import {
  fetchAllHolidays,
  fetchHolidaysByYear,
  fetchHolidaysBetween,
  CaoHolidaysError,
  type Holiday,
  type FetchOptions,
} from 'cao-holidays'

// 全件取得（CSV 収録の全期間、現状 1955〜翌年）
// 呼ぶたびに毎回 fetch する — Caveats: キャッシュなし 参照
const all = await fetchAllHolidays()

// 年指定（Date は JST で正規化される — Caveats: タイムゾーン 参照）
const y2026 = await fetchHolidaysByYear(2026)
// => [{ date: '2026-01-01', name: '元日' }, ...]

// 日付範囲（両端含む、Date でも YYYY-MM-DD 文字列でも可）
const gw = await fetchHolidaysBetween('2026-04-29', '2026-05-06')

// AbortSignal でキャンセル / タイムアウト — Caveats: タイムアウト 参照
const ctrl = new AbortController()
setTimeout(() => ctrl.abort(), 3000)
await fetchHolidaysByYear(2026, { signal: ctrl.signal })
// もしくは AbortSignal.timeout(ms) を直接渡す:
await fetchHolidaysByYear(2026, { signal: AbortSignal.timeout(5000) })

// fetch を差し替えてプロキシ / テスト — Caveats: ブラウザ利用 参照
await fetchHolidaysByYear(2026, { fetch: myCustomFetch })

// エラーハンドリング
try {
  await fetchHolidaysByYear(2999)
} catch (e) {
  if (e instanceof CaoHolidaysError) {
    console.error(e.code, e.message, e.cause)
    // e.code: 'INVALID_INPUT' | 'OUT_OF_RANGE' | 'FETCH_FAILED' | 'PARSE_FAILED'
  }
}
```

### API リファレンス

```ts
type Holiday = {
  date: string  // 'YYYY-MM-DD' (JST)
  name: string  // 内閣府の名称をそのまま (例: '元日')
}

type FetchOptions = {
  signal?: AbortSignal           // fetch のキャンセル / タイムアウト
  fetch?: typeof fetch           // DI 用 (テスト・プロキシ・CORS 回避)
}

class CaoHolidaysError extends Error {
  readonly code: 'INVALID_INPUT' | 'OUT_OF_RANGE' | 'FETCH_FAILED' | 'PARSE_FAILED'
}

function fetchAllHolidays(options?: FetchOptions): Promise<Holiday[]>
function fetchHolidaysByYear(year: number, options?: FetchOptions): Promise<Holiday[]>
function fetchHolidaysBetween(
  from: Date | string,
  to: Date | string,
  options?: FetchOptions,
): Promise<Holiday[]>
```

## 注意点 (Caveats)

- **キャッシュなし**: 関数を呼ぶたびに毎回 fetch します。複数年が必要な場合は `fetchHolidaysBetween` か `fetchAllHolidays` を1回呼ぶ方が効率的です。同一プロセス内でもキャッシュしません。利用者側でキャッシュしたければ `FetchOptions.fetch` 経由で被せられます。
- **CKAN メタデータの停滞**: e-gov の CKAN メタデータ自体は2022-08-17から更新が止まっていますが、`resources[0].url` は現時点でも実 CSV を指しています。
- **タイムゾーン**: 日付はすべて JST 固定で扱います。`Date` を渡した場合は JST の `YYYY-MM-DD` に正規化されます。
- **ブラウザ利用**: 内閣府サーバが CORS ヘッダを返さないため、ブラウザ直接実行は不可です。`FetchOptions.fetch` で自前のプロキシエンドポイントに向けてください。
- **タイムアウト**:
  - **ライブラリ**: 自動タイムアウトはしません。必要なら `FetchOptions.signal` に `AbortSignal.timeout(ms)` を渡してください（後述の Quick start (ライブラリ) 参照）。
  - **CLI**: `--timeout <ms>`（既定 30000ms）は **per-attempt timeout** です。`--retry` を併用した場合、各試行ごとに新しい `AbortSignal.timeout` が作られます。フラグを指定しなければ既定値が使われます。
- **リトライ (CLI のみ)**:
  - `--retry <n>`（既定 2、`0` で無効化）と `--retry-delay <ms>`（既定 500、初回バックオフ）。指数バックオフ + ±20% ジッタ。`Retry-After` ヘッダがあれば優先します。
  - 対象: HTTP 5xx / 408 / 429 / ネットワーク失敗 (`TypeError`) / `AbortError` / `TimeoutError`。それ以外の 4xx と `PARSE_FAILED` / `INVALID_INPUT` / `OUT_OF_RANGE` は **再試行しません**。
  - ライブラリ API は現状リトライ機構を持ちません。必要なら `FetchOptions.fetch` に自前のリトライ実装を被せてください。
  - **政府サーバへの配慮**: 公開データの一次配信元は内閣府の公的サーバです。`--retry` を増やしても解決しない継続障害には設定値を上げず、上流の停止を疑ってしばらく待つようにしてください。

## デバッグログ

`debug` パッケージを使用しています。fetch URL とバイト数をトレース表示します。

```sh
DEBUG=cao-holidays npx cao-holidays 2026
# 2026-05-05T... cao-holidays resolving CSV URL via CKAN: https://...
# 2026-05-05T... cao-holidays resolved CSV URL: https://www8.cao.go.jp/...
# 2026-05-05T... cao-holidays fetching CSV: https://www8.cao.go.jp/...
# 2026-05-05T... cao-holidays fetched 21538 bytes
```

## データソースとライセンス

- **データ**: 内閣府『[国民の祝日について](https://www8.cao.go.jp/chosei/shukujitsu/gaiyou.html)』。日本政府のオープンデータポリシー（現行: [公共データ利用規約 第1.0版](https://www.digital.go.jp/resources/open_data)、2024-07-05〜）に従い、[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) と互換です。
- **帰属表記例**: 「祝日データ出典: 内閣府『国民の祝日について』(https://www8.cao.go.jp/chosei/shukujitsu/gaiyou.html) を [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) のもとで利用」
- **ライブラリ自体**: MIT ライセンス。詳細は [LICENSE](./LICENSE) を参照してください。

## サポート / バージョン方針

- **対応 Node.js**: LTS の現行 2 系統（22 / 24）を CI で検証しています
- **SemVer**: 0.x のうちは minor bump で破壊的変更を含むことがあります。1.0.0 以降は厳密に SemVer を守ります
- **リリース履歴**: [CHANGELOG.md](./CHANGELOG.md) を参照してください

## 脆弱性報告

[SECURITY.md](https://github.com/aromarious/cao-holidays/blob/main/SECURITY.md) を参照してください。public な issue ではなく [GitHub Private Vulnerability Reporting](https://github.com/aromarious/cao-holidays/security/advisories/new) 経由でお願いします。
