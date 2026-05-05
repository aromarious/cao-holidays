# cao-holidays monorepo ディレクトリ構成案

作成日: 2026-05-05
対象: Phase 2 (JS + Python) 着手時に確立する構成、Phase 3/4 拡張時の追加場所も明記

## 設計方針

1. **言語ごとに `packages/<lang>/` を完全独立**: 各言語のビルド/テスト/リリースは閉じる。コード共有は不可能なので、共有するのは仕様（`docs/spec.md`）と振る舞いの fixture（`fixtures/`）のみ
2. **`fixtures/` を root に置く**: snapshot CSV と期待出力 (JSON/CSV/ICS) を全言語が同一物として読む。これが「異なる言語実装が同じ振る舞いをする」ことの担保
3. **トップレベルファイルはガバナンスと案内に限定**: README / LICENSE / SECURITY.md / .github / .editorconfig / docs。**個別言語のビルド成果物・lock ファイル・依存定義は置かない**
4. **`packages/<lang>/README.md` は package tarball/wheel に同梱**: npm/PyPI/RubyGems からクリックしてきた利用者が「この repo は monorepo の一部」と即座に認識できるよう、各 README の冒頭で宣言
5. **CI workflow は言語ごとに分割し `paths:` フィルタ**: 一方の言語の変更が他方の CI を起動しない。`fixtures/` 変更時のみ全言語 CI を起動
6. **バージョニングは言語ごとに独立**: npm と PyPI で `1.0.0` を揃える幻想を持たない
7. **CLI 提供は JS と Go のみ**: 既存の `npx cao-holidays` で CLI 需要は満たされる。Go は `go install` で単体バイナリが入る言語文化と相性が良いので CLI も提供する。Python / Ruby / Rust / PHP は **library only**（CLI は実装しない）。argparse 相当 + 出力フォーマッタの重複実装コストに対して差別化価値が薄いため。CLI が欲しいユーザーは npm 版を `npx` 経由で利用できる

## Phase 2 時点の構成（JS + Python）

```
cao-holidays/
├── README.md                          # トップ。monorepo 宣言と各言語実装へのリンク
├── README.en.md                       # 英語版同等
├── LICENSE                            # MIT、トップレベル
├── SECURITY.md                        # 既存
├── CHANGELOG.md                       # 各 package CHANGELOG への索引（or 廃止判断あり、後述）
├── .gitignore
├── .editorconfig                      # 全言語共通（既存維持）
├── .nvmrc                             # JS 開発時用（既存維持）
├── Makefile                           # 横断 lint/format/test オーケストレーション（dep ゼロ）
├── .pre-commit-config.yaml            # pre-commit（Python製）で全言語フックを統括
├── .vscode/
│   └── extensions.json                # 推奨拡張のみ commit（settings.json は gitignore）
├── docs/
│   └── spec.md                        # 仕様（言語非依存、各 package の真実）
├── fixtures/                          # 言語横断で共有
│   ├── README.md                      # 更新手順とスクリプトの場所
│   ├── syukujitsu.csv                 # 内閣府 CSV のスナップショット (SJIS のまま)
│   ├── all.json                       # 期待出力: --all --format json
│   ├── 2026.json                      # 期待出力: 2026 年単体
│   ├── 2025-2027.json                 # 期待出力: 年範囲
│   ├── range-2026-04-01_2026-05-31.json  # 期待出力: 日付範囲
│   ├── 2026.csv                       # 期待出力: --format csv
│   └── 2026.ics                       # 期待出力: --format ics
├── scripts/
│   └── sync-fixture.mjs               # 内閣府 CSV を取得して fixtures/ を更新（既存を root へ移動）
├── packages/
│   ├── js/                            # 既存実装をここへ移動
│   │   ├── README.md                  # npm publish に同梱、トップ README へのリンク含む
│   │   ├── package.json               # name: cao-holidays
│   │   ├── tsconfig.json
│   │   ├── biome.json
│   │   ├── vitest.config.ts
│   │   ├── tsup.config.ts
│   │   ├── pnpm-lock.yaml
│   │   ├── .changeset/
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── parse.ts
│   │   │   ├── source.ts
│   │   │   ├── format.ts
│   │   │   └── cli.ts
│   │   ├── bin/
│   │   │   └── cao-holidays.ts
│   │   ├── tests/
│   │   │   └── *.test.ts              # fixtures/ からシンボリック参照（相対パス）
│   │   └── dist/                      # gitignore
│   └── python/                        # Phase 2 で新設
│       ├── README.md                  # PyPI upload に同梱、トップ README へのリンク含む
│       ├── pyproject.toml             # name = "cao-holidays"、build backend は hatchling、[tool.ruff] [tool.mypy] もここに集約
│       ├── uv.lock                    # uv を採用する場合（or poetry.lock）
│       ├── src/
│       │   └── cao_holidays/          # src layout（推奨）
│       │       ├── __init__.py        # 公開 API: fetch_all_holidays / fetch_holidays_by_year / fetch_holidays_between, Holiday, FetchOptions, CaoHolidaysError
│       │       ├── parse.py
│       │       ├── source.py
│       │       └── format.py
│       ├── tests/
│       │   └── test_*.py              # fixtures/ から相対参照
│       └── dist/                      # gitignore
├── .github/
│   ├── workflows/
│   │   ├── ci-js.yml                  # paths: packages/js/**, fixtures/**, scripts/sync-fixture.mjs, .github/workflows/ci-js.yml
│   │   ├── ci-python.yml              # paths: packages/python/**, fixtures/**, .github/workflows/ci-python.yml
│   │   ├── release-js.yml             # changesets/action、OIDC で npm publish
│   │   ├── release-python.yml         # PyPI Trusted Publishing（OIDC）
│   │   ├── healthcheck.yml            # 既存（内閣府 CSV の到達性週次確認）
│   │   └── codeql.yml                 # languages: [javascript-typescript, python]
│   ├── codeql/
│   │   └── codeql-config.yml
│   └── dependabot.yml                 # ecosystems: npm (packages/js)、pip (packages/python)、github-actions (root)
└── tmp/                               # gitignored、Claude session scratch（既存）
```

## Phase 3 で追加（Go, Ruby）

```
packages/
├── js/                                # 既存
├── python/                            # 既存
├── go/                                # 新設
│   ├── README.md
│   ├── go.mod                         # module github.com/aromarious/cao-holidays/packages/go
│   ├── go.sum
│   ├── caoholidays.go                 # FetchAllHolidays / FetchHolidaysByYear / FetchHolidaysBetween
│   ├── parse.go
│   ├── source.go
│   ├── format.go
│   ├── *_test.go                      # 同階層 (Go 慣習)
│   └── cmd/
│       └── cao-holidays/
│           └── main.go                # CLI バイナリ
└── ruby/                              # 新設（library only、CLI なし）
    ├── README.md
    ├── cao-holidays.gemspec
    ├── Gemfile
    ├── Gemfile.lock
    ├── lib/
    │   ├── cao_holidays.rb            # require のエントリ
    │   └── cao_holidays/
    │       ├── version.rb
    │       ├── parse.rb
    │       ├── source.rb
    │       └── format.rb
    └── spec/
        └── *_spec.rb                  # RSpec
```

`.github/workflows/` に追加: `ci-go.yml`, `ci-ruby.yml`, `release-go.yml`（タグ push でモジュール公開、`v*` タグ）, `release-ruby.yml`（`gem push`、Trusted Publishing 対応）。CodeQL は Go も対応、Ruby は CodeQL 公式サポートあり。

## Phase 4 で追加（PHP, Rust）

```
packages/
├── php/                               # library only、CLI なし
│   ├── README.md
│   ├── composer.json                  # name: aromarious/cao-holidays
│   ├── composer.lock
│   ├── phpunit.xml
│   ├── src/
│   │   ├── CaoHolidays.php
│   │   ├── Parser.php
│   │   ├── Source.php
│   │   └── Formatter.php
│   └── tests/
│       └── *Test.php
└── rust/                              # library only、CLI なし（Cargo.toml は [lib] のみ、[[bin]] なし）
    ├── README.md
    ├── Cargo.toml                     # name = "cao-holidays"
    ├── Cargo.lock
    ├── src/
    │   ├── lib.rs                     # ライブラリエントリ
    │   ├── parse.rs
    │   ├── source.rs
    │   └── format.rs
    └── tests/
        └── *.rs                       # integration tests
```

## 主要な判断ポイント

### 1. `scripts/sync-fixture.mjs` の置き場

**選択**: root の `scripts/` に移動（現在は `packages/js/` 相当の root にある）

**理由**:
- `fixtures/` を更新するスクリプトは言語横断で使う共有資産
- JS で書かれているのは実装の都合だが、配置は responsibility を反映するべき
- 各言語の CI からも root の sync-fixture を呼べる（Node.js さえ入っていれば）

**代替案**: `fixtures/sync.mjs` として `fixtures/` 内に置く案もある。トレードオフは「scripts は実行系、fixtures はデータ系」の責務分割を維持するか、「fixture 関連は1か所に集約」するかの好み。

### 2. CHANGELOG.md の扱い

**選択肢 A**: トップ `CHANGELOG.md` を**廃止**し、各 `packages/<lang>/CHANGELOG.md` に分散
**選択肢 B**: トップ `CHANGELOG.md` を**索引化**（"For per-language changelogs, see packages/js/CHANGELOG.md, packages/python/CHANGELOG.md, ..."）

**推奨**: B（索引のみ）。リポトップから各言語の履歴に飛べるとレビュー時に便利。各言語の CHANGELOG はそれぞれのリリースツールが生成する（次セクション参照）。

### 2b. リリース・バージョニングツール（言語ごとにネイティブ）

Changesets は JS 専用（CLI が `package.json` を直接書き換える仕様で、`pyproject.toml` 等を知らない）。「言語ごとに独立バージョニング」の方針と整合させ、**各言語のコミュニティ慣習に従ったネイティブツール**を採用する。

| 言語 | リリース/バージョニング | CHANGELOG 生成 | publish 経路 |
|---|---|---|---|
| **JS** | [Changesets](https://github.com/changesets/changesets)（継続） | Changesets が自動生成 (`packages/js/CHANGELOG.md`) | `changesets/action` で Release PR → npm publish (OIDC + Trusted Publisher) |
| **Python** | [hatch version](https://hatch.pypa.io/) または [bumpver](https://github.com/mbarkhau/bumpver)。または [uv-dynamic-versioning](https://github.com/ninoseki/uv-dynamic-versioning) で git tag から動的解決 | 手動メンテ or [git-cliff](https://github.com/orhun/git-cliff) で Conventional Commits から生成 | [`pypa/gh-action-pypi-publish`](https://github.com/pypa/gh-action-pypi-publish) で PyPI Trusted Publishing (OIDC) |
| **Go** | git tag のみ (`v0.1.0`)。サブディレクトリ配置の場合は `packages/go/v0.1.0` というタグになる | 手動メンテ or git-cliff | tag を push すれば pkg.go.dev が自動取得 |
| **Ruby** | [`gem-release`](https://github.com/svenfuchs/gem-release) プラグイン or 手動 (`lib/cao_holidays/version.rb` 編集) | 手動メンテ | `gem push` (RubyGems も OIDC Trusted Publishing 対応済み) |
| **Rust** | [`cargo-release`](https://github.com/crate-ci/cargo-release) プラグイン | `cargo-release` 連動 or 手動 | `cargo publish` (crates.io、API token は GitHub Secrets) |
| **PHP** | git tag (`v0.1.0`) | 手動メンテ | tag を push すれば Packagist が webhook で取得（要 Packagist 連携設定） |

**JS 以外で release-please に統一しない理由**:

- JS の Changesets は Phase 1 で安定運用しており、変える理由が弱い
- 各言語の利用者は各言語のリリース慣習を期待する（Python の利用者は `pyproject.toml` の `[project]` テーブル直書き、Go の利用者は `git tag` のみ、Ruby の利用者は `version.rb` を見る）
- Conventional Commits 厳密化のコストが高い（現状は `chore(governance):` 等で近い形だが厳密ではない）
- Changesets の `.changeset/*.md` で「変更を文章で書く」運用を JS 側で続けるなら、release-please の自動生成方式とは思想が衝突する

**Phase ごとの取り入れ順序**:

- Phase 2 着手時: JS は Changesets 継続、Python は `hatch version` を採用（最もシンプル、`pyproject.toml` の `[project] version` を直接更新する CLI）。CHANGELOG は手動メンテで開始し、必要なら git-cliff を後追い導入
- Phase 3 (Go, Ruby): Go は git tag だけで済む。Ruby は `gem-release` 導入
- Phase 4 (PHP, Rust): Rust は `cargo-release` 導入。PHP は git tag + Packagist webhook
- 全体統一の必要が出てきたら release-please 移行を再検討（その時点で各言語の運用実績がそろっているはずなので、判断材料が増える）

### 3. CI workflow のリネーム影響（破壊的）

現在 main protection の Required status checks に登録済み:
- `Lint and typecheck (Node 22)`
- `Lint and typecheck (Node 24)`
- `Test (Node 22)`
- `Test (Node 24)`
- `CodeQL`

これらの **job 名 or workflow 名を変えると ruleset の status check が紐付かなくなる**。Phase 2 の monorepo 移行 PR で:
1. `ci.yml` → `ci-js.yml` にリネーム（job 名は維持できるなら維持）
2. ruleset の Required checks を更新
3. `ci-python.yml` を新規追加
4. ruleset に Python の checks を追加

ruleset 更新は手作業（gh CLI または UI）。Phase 2 の PR を merge する前に ruleset を緩めて、merge 後に再設定、という順番が必要。

### 4. Python パッケージ名の Underscore vs Hyphen

- **PyPI 名**: `cao-holidays`（ハイフン）
- **Python import 名**: `cao_holidays`（アンダースコア）
- これは Python の慣習通り（ハイフンは import に使えない）
- npm の `cao-holidays` と PyPI の `cao-holidays` は名前が揃う、import 時のみ `_` に変わる

### 5. ライブラリ API の命名規約

JS 版（camelCase）と Python 版（snake_case）で命名は分かれる:

| JS | Python |
|---|---|
| `fetchAllHolidays()` | `fetch_all_holidays()` |
| `fetchHolidaysByYear(year)` | `fetch_holidays_by_year(year)` |
| `fetchHolidaysBetween(from, to)` | `fetch_holidays_between(from_, to)` |
| `Holiday` (type) | `Holiday` (TypedDict or dataclass) |
| `FetchOptions` (type) | `FetchOptions` (TypedDict) |
| `CaoHolidaysError` (class) | `CaoHolidaysError` (class) |

各言語の慣習に従い、機能と意味を揃える。fixture テストは「文字列としての出力 (CSV/JSON/ICS) が一致」することで検証するので、API 名が違っても問題ない。

### 6. License の同梱

`LICENSE` は root にあるが、npm/PyPI/RubyGems の各 tarball/wheel にも LICENSE を含めるのが慣習。**コピー方式**を推奨:

- `packages/js/LICENSE` ← root の LICENSE のコピー（Phase 2 移行時に作成、以後手動同期）
- `packages/python/LICENSE` 同上
- 各言語の package metadata で `license-file` 等を指定

symlink は Windows tarball で破綻するので避ける。年1回程度の更新なら手動コピーで十分。

### 7. Dependabot の構成

```yaml
# .github/dependabot.yml
version: 2
updates:
  - package-ecosystem: "npm"
    directory: "/packages/js"
    schedule:
      interval: "weekly"
    groups:
      dev-dependencies:
        dependency-type: "development"
  - package-ecosystem: "pip"
    directory: "/packages/python"
    schedule:
      interval: "weekly"
  - package-ecosystem: "github-actions"
    directory: "/"
    schedule:
      interval: "weekly"
```

Phase 3 で `gomod`, `bundler` を追加、Phase 4 で `composer`, `cargo` を追加。

### 8. CodeQL の対応言語

- JS/TS: 既に有効
- Python: CodeQL 公式サポート
- Go: 公式サポート
- Ruby: 公式サポート
- PHP: コミュニティサポート（精度は他より低め）
- Rust: 2024年に GA、利用可能

`.github/workflows/codeql.yml` の matrix を Phase 進行ごとに増やす。`.github/codeql/codeql-config.yml` の `paths-ignore` で `scripts/` 除外は維持。

## Lint / Format / 型チェック / pre-commit

### ツール選定（言語ごとにネイティブ）

「言語ごとにコミュニティ慣習に従う」方針を維持。Biome と Ruff のように Rust 製の高速統合ツールが揃う言語は積極採用するが、無理に全言語統一は狙わない。

| 言語 | format | lint | 型チェック | 備考 |
|---|---|---|---|---|
| **JS/TS** | Biome（現状継続） | Biome | `tsc --noEmit` | 既に統合済み |
| **Python** | **Ruff format** | **Ruff** | **mypy --strict** | Ruff = Black + isort + Flake8 + 多数プラグインを統合（Rust 製）。Biome と思想が揃う |
| **Go** | `gofmt`（標準） | [`golangci-lint`](https://golangci-lint.run/)（default preset） | (言語が型を保証) | 言語付属で議論不要 |
| **Ruby** | RuboCop | RuboCop | （導入しない） | OSS ライブラリで Sorbet/Steep は過剰、API 小さい |
| **Rust** | `rustfmt`（標準） | `clippy -D warnings` | (rustc が型保証) | 言語付属で議論不要 |
| **PHP** | [Pint](https://laravel.com/docs/pint) | [PHPStan](https://phpstan.org/) level 6 | PHPStan 兼 | Pint は Laravel 製 PHP-CS-Fixer ラッパー、設定が軽くて OSS 向き |

**判断材料**:

- **Python (Ruff vs Black+Flake8)**: Black + Flake8 は枯れているが、新規プロジェクトで採用する積極理由が薄い。Ruff は Astral 社（uv 開発元）が積極開発、ecosystem 対応も急拡大
- **Ruby (RuboCop vs Standard)**: RuboCop は設定が重め。後で [`standard`](https://github.com/standardrb/standard) gem (RuboCop プリセット) を被せる選択肢を残す
- **PHP (Pint vs PHP-CS-Fixer)**: Pint は Laravel 限定ツールではない。設定 JSON 1 ファイルで済むので OSS のメンテ負荷が低い
- **PHPStan のレベル**: level 0〜9。CLI 規模なら level 6（中程度厳しめ）から始めて、必要に応じて引き上げ

### Monorepo 配置: 設定ファイルは各 package 配下、横断は root

```
cao-holidays/
├── Makefile                            # root: 横断 lint/format/test 束ね（dep ゼロ）
├── .pre-commit-config.yaml             # root: 全言語フック統括
├── .vscode/extensions.json             # root: 推奨拡張（biome / ruff / python / etc.）
├── packages/
│   ├── js/biome.json                   # 既存
│   ├── js/tsconfig.json                # 既存
│   ├── python/pyproject.toml           # [tool.ruff] [tool.mypy] を集約（ruff.toml は作らない）
│   ├── go/.golangci.yml                # Phase 3
│   ├── ruby/.rubocop.yml               # Phase 3
│   ├── rust/rustfmt.toml               # Phase 4
│   ├── rust/clippy.toml                # Phase 4
│   ├── php/pint.json                   # Phase 4
│   └── php/phpstan.neon                # Phase 4
```

**設定ファイル方針**:
- Python は `pyproject.toml` に `[tool.ruff]` `[tool.mypy]` テーブルを集約（複数ファイルに分散しない）
- 他言語は各ツール標準のファイル名に従う
- 言語横断の規約は root の `.editorconfig`（既存）で吸収

### pre-commit セットアップ（Python 製の汎用ツール）

`.pre-commit-config.yaml` を root に置き、全言語フックを統括。

```yaml
repos:
  - repo: https://github.com/biomejs/pre-commit
    rev: v2.4.0
    hooks:
      - id: biome-check
        files: ^packages/js/

  - repo: https://github.com/astral-sh/ruff-pre-commit
    rev: v0.10.0
    hooks:
      - id: ruff
        files: ^packages/python/
      - id: ruff-format
        files: ^packages/python/

  - repo: https://github.com/pre-commit/mirrors-mypy
    rev: v1.13.0
    hooks:
      - id: mypy
        files: ^packages/python/src/
        additional_dependencies: []  # 必要なら型 stub を列挙

  # Phase 3 で追加:
  # - golangci-lint (packages/go/)
  # - rubocop (packages/ruby/)

  # Phase 4 で追加:
  # - rustfmt / clippy (packages/rust/)
  # - pint / phpstan (packages/php/)
```

導入は `pip install pre-commit && pre-commit install`。Python が必要だが、Phase 2 以降は repo 自体に Python が含まれるので追加負担なし。

**husky を選ばない理由**: husky は Node.js 必須・JS 専用設計で、Python/Go/Ruby のフックを統合するには不適切。多言語 monorepo の標準は `pre-commit`（Python ツール）または `lefthook`（Go ツール）。エコシステムの広さで pre-commit を採用。

### Makefile による横断オーケストレーション

root `package.json` を `packages/js/` に降ろすので、root には言語非依存な `Makefile` を置いて開発者向けの横断コマンドを提供する。

```makefile
.PHONY: lint format test typecheck install
.PHONY: lint-js lint-python format-js format-python test-js test-python typecheck-js typecheck-python

# 横断
lint: lint-js lint-python
format: format-js format-python
test: test-js test-python
typecheck: typecheck-js typecheck-python

install:
	cd packages/js && pnpm install
	cd packages/python && uv sync

# JS
lint-js:
	cd packages/js && pnpm lint
format-js:
	cd packages/js && pnpm format
test-js:
	cd packages/js && pnpm test
typecheck-js:
	cd packages/js && pnpm typecheck

# Python
lint-python:
	cd packages/python && uv run ruff check .
format-python:
	cd packages/python && uv run ruff format .
test-python:
	cd packages/python && uv run pytest
typecheck-python:
	cd packages/python && uv run mypy src

# Phase 3 で test-go / lint-go / test-ruby / lint-ruby を追加
# Phase 4 で test-rust / lint-rust / test-php / lint-php を追加
```

**なぜ Makefile**:
- 言語非依存・依存ゼロ。`make` はどの開発環境にも入っている
- Python だけ触る人が「全部 lint」したい時に Node.js を要求しない
- Just / Taskfile はモダンだが追加インストール必須
- root に `package.json` を置いて pnpm scripts で書く案もあるが、Node.js 必須になる

将来的に [`mise`](https://mise.jdx.dev/) でツールバージョン pin + タスクランナーを兼ねる案もあるが、まずは Makefile が軽量。

### CI と Makefile の関係

**CI workflow は Makefile を経由せず、ネイティブコマンドを直接呼ぶ**:

```yaml
# .github/workflows/ci-python.yml (抜粋)
- run: uv run ruff check .
- run: uv run ruff format --check .
- run: uv run mypy src
- run: uv run pytest
```

理由:
- Makefile 経由にすると CI ログが「`make` 出力 → 内部コマンド出力」と二重になり読みにくい
- `set -e` の挙動や環境変数の渡り方が CI 環境で微妙に違うことがある
- Makefile は **開発者ローカル用** と位置付け、CI は **ネイティブツール直接** で分離

### Phase 1 → Phase 2 移行時のセットアップ

- `packages/js/biome.json` に既存ファイルを移動
- `packages/python/pyproject.toml` 新設（`[tool.ruff]` `[tool.mypy]` セクション含む）
- root `Makefile` 新設
- root `.pre-commit-config.yaml` 新設（biome + ruff + mypy フック）
- root `.vscode/extensions.json` 新設（推奨: `biomejs.biome`, `charliermarsh.ruff`, `ms-python.python`, `ms-python.mypy-type-checker`）
- `pre-commit install` をローカルで実行（チームで共有するなら CONTRIBUTING.md に手順記載、ただし Phase 11 で defer 中）

## 移行手順（Phase 2 着手時にやること）

1. **branch protection の Required status checks を一旦緩める**: ruleset を編集して必須チェックを空 or 既存のままにし、後で更新できるようにする
2. **`packages/js/` を作成して既存ファイルを `git mv`**: `src/` `tests/` `bin/` `package.json` `tsconfig.json` `biome.json` `vitest.config.ts` `tsup.config.ts` `pnpm-lock.yaml` `.changeset/` `dist/` を移動
3. **`fixtures/` を作成し、`packages/js/tests/fixtures/syukujitsu.csv` を移動**: パス参照を `../../../fixtures/syukujitsu.csv` 等に書き換え
4. **期待出力 fixture を生成**: 既存 CLI で `--format json/csv/ics` を叩いて期待値を `fixtures/*.{json,csv,ics}` に保存
5. **`scripts/sync-fixture.mjs` を root に移動し、出力先を新 `fixtures/` に変更**
6. **`packages/python/` を新設**: `pyproject.toml` 雛形、`src/cao_holidays/__init__.py` 空、`tests/` 空
7. **CI workflow を分割**: `ci.yml` → `ci-js.yml`、`ci-python.yml` 新規。job 名は status check 互換性を考えて維持を試みる
8. **`dependabot.yml` 更新**: directory パスを `/packages/js`、`/packages/python` に分割
9. **`.github/workflows/codeql.yml` を更新**: Python を matrix に追加
10. **トップ `README.md` を全面書き換え**: 「multi-language monorepo」宣言、各 package へのリンク、`packages/js/README.md` へ既存 README 内容を移動
11. **`packages/js/README.md` は既存 README をベースに、冒頭で monorepo 宣言**
12. **PR を1つに収める** or **小さく分割**: ファイル移動 PR と Python 雛形追加 PR を分けるとレビューしやすい
13. **merge 後に ruleset を更新**: 新しい status check 名で必須化
14. **Python 実装本体は別 PR** で進める（fixture 一致テスト含む）

## 補足: monorepo 化のリスク

- **import path の変化**: 現状 `package.json` を `import pkg from '../package.json'` で読んでいる箇所（User-Agent 用）は、`packages/js/` 配下なら相対パスは変わらない（同階層で完結）。fixture の参照パスは変わる
- **dist/ パスの変化**: `bin/cao-holidays.ts` の build 出力 `dist/bin/cao-holidays.js` は `packages/js/dist/bin/cao-holidays.js` になる。`package.json` の `bin` は相対パスなので OK
- **publish 範囲の確認**: `packages/js/package.json` の `files` は `["dist", "README.md", "LICENSE"]` のまま。`publint` は移動後にも実行して確認する
- **OIDC Trusted Publisher の更新**: npm Trusted Publisher の設定で workflow ファイルを `release.yml` から `release-js.yml` に変える場合、npm 側の設定変更が必要

## Out of scope（この構成案では扱わない）

- pnpm workspace 化: 多 JS パッケージ予定がないため不要
- Turborepo / Nx 等のビルドツール導入: 各言語独立なのでオーバーキル
- 共通 lint 設定の root 化: 言語ごとに別ツールなので意味なし
- ドキュメントサイト統合（Docusaurus 等）: README で十分、必要になったら検討
