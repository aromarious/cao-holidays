# cao-holidays

> [English version](./README.en.md)

**`cao-holidays` は、内閣府が公開している『国民の祝日』 CSV を実行時に取得して使うためのライブラリ + CLI を、複数言語で同じ振る舞いで提供する monorepo です。**

公的データソース ([内閣府公式 CSV](https://www8.cao.go.jp/chosei/shukujitsu/gaiyou.html)) を実行時 fetch することで、静的データ埋め込み式 (パッケージ更新待ち) ・ルール計算式 (法改正に追従できない) のいずれの方式も持つ「最新性」と「一回性の特例祝日への追従」を両立しています。

## パッケージ

| 言語 | パッケージ | レジストリ | ステータス |
|---|---|---|---|
| **JavaScript / TypeScript** | [`packages/js/`](./packages/js/README.md) | [npm: cao-holidays](https://www.npmjs.com/package/cao-holidays) | ✅ released ([CHANGELOG](./packages/js/CHANGELOG.md)) |
| **Python** | `packages/python/` | (PyPI: cao-holidays) | 🚧 planned (Phase 2、ロードマップ [#14](https://github.com/aromarious/cao-holidays/issues/14)) |
| **Go / Ruby / Rust / PHP** | (各 `packages/<lang>/`) | (各レジストリ) | 🗓 future (Phase 3-4) |

各言語実装は [`fixtures/`](./fixtures/README.md) のスナップショットに対して**バイト一致の出力**を返すことで、振る舞いの同一性を担保します。

## クイックスタート (JS)

```sh
npx cao-holidays 2026
# date,name
# 2026-01-01,元日
# 2026-01-12,成人の日
# ...
```

詳細・全機能は [`packages/js/README.md`](./packages/js/README.md) を参照してください。

## リポジトリ構成

```
cao-holidays/
├── packages/
│   └── js/                  # JavaScript / TypeScript 実装 (npm: cao-holidays)
├── fixtures/                # 言語横断の入力 CSV と期待出力 (JSON / CSV / ICS)
├── scripts/
│   ├── sync-fixture.mjs     # 内閣府の最新 CSV を fixtures/syukujitsu.csv に同期
│   └── generate-fixtures.mjs # JS 実装で期待出力を再生成
├── docs/
│   ├── spec.md              # 言語非依存の仕様（各言語実装の真）
│   ├── monorepo-structure.md # ディレクトリ設計
│   └── release-runbook.md   # 各言語のリリース手順
├── Makefile                 # 横断開発タスク (lint / format / test / typecheck / build)
├── .github/
│   └── workflows/           # ci-js.yml / release.yml / codeql.yml / healthcheck.yml
├── CONTRIBUTING.md
├── CODE_OF_CONDUCT.md
├── SECURITY.md
└── LICENSE
```

設計の判断材料・拡張ポイントは [`docs/monorepo-structure.md`](./docs/monorepo-structure.md) を、リリース手順は [`docs/release-runbook.md`](./docs/release-runbook.md) を参照してください。

## 開発タスク

```sh
make help                # 全ターゲット一覧
make install             # 全言語の依存をインストール (現状 JS のみ)
make test                # 全言語の test
make sync-fixture        # 内閣府の最新 CSV に同期
make generate-fixtures   # 期待出力 JSON / CSV / ICS を再生成
```

各言語固有のターゲットは `make {lint,test,build}-js` のように suffix を付けます（Python 追加時は `-python` も増えます）。

## データソースとライセンス

- **データ**: 内閣府『[国民の祝日について](https://www8.cao.go.jp/chosei/shukujitsu/gaiyou.html)』。日本政府のオープンデータポリシー（現行: [公共データ利用規約 第1.0版](https://www.digital.go.jp/resources/open_data)、2024-07-05〜）に従い、[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) と互換です。
- **帰属表記例**: 「祝日データ出典: 内閣府『国民の祝日について』(https://www8.cao.go.jp/chosei/shukujitsu/gaiyou.html) を [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) のもとで利用」
- **コード**: MIT ライセンス。詳細は [LICENSE](./LICENSE) を参照してください。

## 貢献 / 脆弱性報告

- 開発の参加方法は [CONTRIBUTING.md](./CONTRIBUTING.md) と [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md) を参照してください
- 脆弱性は [SECURITY.md](./SECURITY.md) の手順に従い [GitHub Private Vulnerability Reporting](https://github.com/aromarious/cao-holidays/security/advisories/new) でお願いします（public issue は使わないでください）
