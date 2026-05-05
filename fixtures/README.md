# fixtures/

`cao-holidays` の各言語実装が**同一の振る舞い**を返すことを担保するためのスナップショット。

## ファイル

| ファイル | 内容 |
|---|---|
| `syukujitsu.csv` | 内閣府公式 CSV のスナップショット（SJIS のまま）。これが入力データ |
| `all.json` | `--all --format json` の期待出力 |
| `2026.json` | `2026` 年単体 (`--format json`) |
| `2025-2027.json` | `2025..2027` 年範囲 (`--format json`) |
| `range-2026-04-01_2026-05-31.json` | 日付範囲 (`--format json`) |
| `2026.csv` | `2026 --format csv` |
| `2026.ics` | `2026 --format ics` |

各言語実装は `syukujitsu.csv` をテスト時に読み、API / CLI で `*.json` `*.csv` `*.ics` と**バイト一致**することを検証する。

## 更新方法

### 1. 入力 CSV を内閣府の最新版に同期

```bash
# repo root から
node scripts/sync-fixture.mjs
# または
make sync-fixture
```

スクリプトは CKAN 経由で URL 解決 → CSV 取得 → 既存 fixture とバイナリ等価なら no-op、差分があれば上書き。

### 2. 期待出力を再生成

`syukujitsu.csv` が更新されたら、依存する各種期待出力 (`*.json` `*.csv` `*.ics`) も同時に再生成する:

```bash
# packages/js が install 済み（tsx が必要）であること
cd packages/js && node --import tsx ../../scripts/generate-fixtures.mjs
# または repo root から
make generate-fixtures
```

JS 実装の `run()` を fake fetch 経由で呼ぶので、JS の出力フォーマット変更にも追従する。他言語実装はこの結果と一致する必要がある。

## なぜ root に置くか

`fixtures/` は言語横断で参照される共有資産であり、特定言語パッケージの一部ではない。そのため repo root に置き、各言語の `tests/` から相対 import で参照する。

設計詳細は [`docs/monorepo-structure.md`](../docs/monorepo-structure.md) 参照。
