# cao-holidays リリース運用書

作成日: 2026-05-05
対象: Phase 2（monorepo 移行後）以降の各言語パッケージのリリース手順
姉妹ドキュメント: [`monorepo-structure.md`](./monorepo-structure.md)（設計）、Issue [#14](https://github.com/aromarious/cao-holidays/issues/14)（ロードマップ）

## 概要

このドキュメントは、各言語パッケージを実際にリリースする際の手順書（runbook）。設計上の意図は `monorepo-structure.md`、ロードマップは Issue #14、仕様は `docs/spec.md` を参照。

### バージョニング方針（再掲）

- **言語ごとに独立**: npm と PyPI で `1.0.0` を揃える前提を持たない
- **パッケージ名は揃える**: npm/PyPI/RubyGems すべて `cao-holidays`、Rust `cao-holidays`、PHP `aromarious/cao-holidays`
- **SemVer 準拠**（PHP/Ruby/Python は各々の慣習も尊重）
- **CLI 提供は JS と Go のみ**: 他言語は library only。リリース後のスモークテストも Python/Ruby/Rust/PHP は import / require ベース、JS と Go のみ CLI smoke を含む

### タグ命名規則（必須）

monorepo で複数言語のリリースが混ざるため、**プレフィックス付きタグ**を採用:

| 言語 | タグ形式 | 制約 |
|---|---|---|
| JS | `js-v0.2.0` | Changesets が GitHub Releases も自動作成 |
| Python | `python-v0.2.0` | release workflow がこのパターンで trigger |
| **Go** | **`packages/go/v0.1.0`** | **Go module 仕様で固定**（pkg.go.dev はサブディレクトリ + `v` プレフィックスを要求） |
| Ruby | `ruby-v0.1.0` | release workflow trigger |
| Rust | `rust-v0.1.0` | release workflow trigger |
| PHP | `php-v0.1.0` | Packagist は任意のタグを取得するが、対称性のため統一 |

## 共通の前提

### 必要権限

- **GitHub**: `aromarious/cao-holidays` への push 権限、Release PR を merge できる権限
- **npm**: OIDC Trusted Publisher（リポ側で release-js.yml に紐付け済み、追加設定不要）
- **PyPI**: Trusted Publishing（OIDC、Phase 2 着手時に PyPI 側で設定）
- **RubyGems**: Trusted Publishing（OIDC、Phase 3 着手時に設定）
- **crates.io**: API token を GitHub Secrets `CARGO_REGISTRY_TOKEN` に設定（Phase 4 着手時）
- **Packagist**: GitHub webhook 連携（Phase 4 着手時、UI から1回設定）

### ブランチ運用

- 機能開発: `feature/*` ブランチ → main に PR
- バージョン bump: 各言語のリリースツールが Release PR を立てる（JS/Python）、または手動 PR（Go/Ruby/Rust/PHP）
- `main` には Required status checks（CI 全 job + CodeQL）が必要
- `main` への直 push は ruleset で禁止

### ローカル準備

```bash
# JS
cd packages/js
pnpm install

# Python
cd packages/python
uv sync
```

---

## リリース判断: いつ release するか

| 状況 | アクション |
|---|---|
| ユーザー影響のあるバグ修正 | patch（例: 0.2.0 → 0.2.1） |
| 後方互換ありの機能追加 | minor（例: 0.2.1 → 0.3.0） |
| 後方互換なしの API 変更 | major（例: 0.3.0 → 1.0.0）。0.x 中は minor で代用も可（SemVer 0.x ルール） |
| README/docs のみの変更 | **基本リリースしない**。次のコード変更と一緒に出す |
| 内部リファクタ・CI 整備 | リリースしない |
| 依存関係の更新（脆弱性修正含む） | npm `audit` で High 以上が出れば patch、Low/Moderate は次のリリースに含める |

**鉄則**: 「直したいから出す」のではなく「ユーザーに何が変わるか」基準で判断。changeset を切る = リリースする意図、と一致させる。

---

## JS パッケージのリリース手順

### 1. 通常フロー（Changesets + Release PR）

```bash
# === Step 1: feature ブランチで実装 ===
git checkout -b feature/cli-retry
# ... コードを書く、テストを書く、commit ...

# === Step 2: changeset を追加 ===
cd packages/js
pnpm exec changeset

# 対話: 
#  - Which packages would you like to include? → cao-holidays をスペースで選択
#  - Which packages should have a major bump? → なければそのまま enter
#  - Which packages should have a minor bump? → 該当なら spaceで選択
#  - Which packages should have a patch bump? → 該当なら spaceで選択
#  - Please enter a summary for this change → 利用者向けの英文で記述
#    (このテキストが CHANGELOG.md にそのまま転記される)

# .changeset/<random-name>.md が生成される
git add .changeset/*.md
git commit -m "chore: add changeset for cli retry"

# === Step 3: PR を出して merge ===
git push -u origin feature/cli-retry
gh pr create --title "feat(cli): add fetch retry" --body "Closes #13. ..."
# レビュー & merge

# === Step 4: Release PR の自動生成を待つ ===
# main に merge されると release-js.yml の changesets/action が
# 自動で "Version Packages" PR を立てる
# - packages/js/package.json の version 更新
# - packages/js/CHANGELOG.md にエントリ追加
# - .changeset/*.md を消費（削除）

# === Step 5: Release PR を merge ===
# Version Packages PR の内容を確認 → approve → merge
# merge と同時に release-js.yml が npm publish を実行（OIDC）
# GitHub Releases も同時に作成される

# === Step 6: 確認 ===
npm view cao-holidays version       # 新バージョンが出ているか
npx cao-holidays@<new-version> 2026 # fresh install で動作確認
```

### 2. 緊急 patch リリース（hotfix）

通常フローと同じ。「Release PR を待たずに即時 publish したい」場合は、Release PR を merge する瞬間まで Changesets/action が自動でやってくれるので、特別な手順は不要（PR レビューを早く回すだけ）。

### 3. 想定エラーと対処

| 症状 | 原因 | 対処 |
|---|---|---|
| Release PR が立たない | `.changeset/*.md` がコミットされていない、または前回のリリースで全部消費済み | changeset を追加する。または README only の変更なら出さない判断 |
| `npm publish` が `403` で失敗 | OIDC Trusted Publisher 設定が壊れている、または workflow file 名を変えた | npm 側の Trusted Publisher 設定を確認、`workflow filename` が `release-js.yml` と一致しているか |
| `npm publish` が `409 Conflict` | 同じバージョンが既に publish 済み | `package.json` の version を上げ直す（changeset を追加してフローを回す） |
| `provenance` 関連エラー | リポ public でない / OIDC token 取得失敗 | 一旦 `--provenance=false` で publish、原因調査後に再有効化 |

---

## Python パッケージのリリース手順

### 1. 通常フロー（hatch version + tag-triggered release）

```bash
# === Step 1: feature ブランチで実装 ===
git checkout -b feature/python-retry
# ... コードを書く、テストを書く、commit ...

# === Step 2: バージョン bump ===
cd packages/python
uv run hatch version minor          # 0.1.0 → 0.2.0
# または手動で pyproject.toml の version を編集

# CHANGELOG は手動メンテ（Phase 2 着手時の方針）
$EDITOR CHANGELOG.md
# ## [0.2.0] - YYYY-MM-DD
# ### Added
# - ...
# ### Fixed
# - ...

git add pyproject.toml CHANGELOG.md
git commit -m "chore(python): bump to 0.2.0"

# === Step 3: PR を出して merge ===
git push -u origin feature/python-retry
gh pr create --title "feat(python): release 0.2.0" --body "..."
# レビュー & merge

# === Step 4: tag を切って push ===
git checkout main
git pull
git tag python-v0.2.0
git push origin python-v0.2.0

# === Step 5: release-python.yml が起動 ===
# tag push を trigger に hatch build && pypa/gh-action-pypi-publish が走る
# OIDC Trusted Publishing で PyPI に upload

# === Step 6: 確認 ===
pip index versions cao-holidays    # 新バージョンが出ているか
pip install --no-cache-dir cao-holidays==0.2.0
python -c "import cao_holidays; print(cao_holidays.__version__)"
```

### 2. CHANGELOG の運用

Phase 2 開始時は手動。後で git-cliff 等で半自動化を検討（Conventional Commits 厳密化が前提）。フォーマットは [Keep a Changelog](https://keepachangelog.com/) 準拠:

```markdown
# Changelog

## [Unreleased]

## [0.2.0] - 2026-06-15

### Added
- CLI に `--retry` フラグを追加（#13）

### Changed
- ...

### Fixed
- ...

[Unreleased]: https://github.com/aromarious/cao-holidays/compare/python-v0.2.0...HEAD
[0.2.0]: https://github.com/aromarious/cao-holidays/releases/tag/python-v0.2.0
```

### 3. 想定エラーと対処

| 症状 | 原因 | 対処 |
|---|---|---|
| `hatch version` がエラー | `pyproject.toml` の `[tool.hatch.version]` 未設定 | `[tool.hatch.version] path = "src/cao_holidays/__init__.py"` を追記し、`__init__.py` に `__version__ = "0.1.0"` を持たせる |
| PyPI publish が `403` | Trusted Publishing 設定不一致 | PyPI のプロジェクト設定で `repository: aromarious/cao-holidays`、`workflow: release-python.yml`、`environment: pypi` を確認 |
| tag を間違えた（`python-v0.2.0` を意図したのに `v0.2.0` を push） | タイポ | `git tag -d <wrong>` でローカル削除、`git push --delete origin <wrong>` でリモート削除、正しいタグを切り直す。ただし PyPI に publish 済みなら yank しないと残る |
| 同じバージョンを再 publish しようとした | PyPI は同一バージョン再 upload を許さない | patch を上げて出し直し（PyPI は yank 後でも同じバージョン名は再利用不可） |

---

## Go モジュールのリリース手順（Phase 3 以降）

### 1. 通常フロー（git tag のみ、release workflow 不要）

```bash
# === Step 1: 機能 PR を merge ===
git checkout -b feature/go-impl
# ... 実装 ...
gh pr create --title "feat(go): ..."
# merge

# === Step 2: tag を切って push ===
git checkout main
git pull
git tag packages/go/v0.1.0           # ← サブディレクトリ + v プレフィックス（必須）
git push origin packages/go/v0.1.0

# === Step 3: 確認 ===
# pkg.go.dev は tag push の数分以内に自動取得
# https://pkg.go.dev/github.com/aromarious/cao-holidays/packages/go@v0.1.0
GOPROXY=https://proxy.golang.org go install github.com/aromarious/cao-holidays/packages/go/cmd/cao-holidays@v0.1.0
```

### 2. 想定エラー

| 症状 | 原因 | 対処 |
|---|---|---|
| pkg.go.dev に出てこない | tag 形式違反（`v0.1.0` だけ等、サブディレクトリ prefix なし） | 正しい形式で tag を切り直し |
| `go install` が古い version を返す | proxy キャッシュ | `GOPROXY=direct go install ...` で直取得を試す |
| メジャーバージョン v2+ で import path 不一致 | `module github.com/.../packages/go/v2` への変更が必要 | go の v2+ ルール参照、Phase 3 で v1.x に留めれば回避可能 |

---

## Ruby gem のリリース手順（Phase 3 以降）

### 1. 通常フロー（gem-release + tag-triggered）

```bash
# === Step 1: 機能 PR を merge ===

# === Step 2: バージョン bump ===
cd packages/ruby
gem bump --version minor           # lib/cao_holidays/version.rb を更新
# または手動で `VERSION = "0.2.0"` を編集

git add lib/cao_holidays/version.rb CHANGELOG.md
git commit -m "chore(ruby): bump to 0.2.0"
gh pr create --title "chore(ruby): release 0.2.0"
# merge

# === Step 3: tag ===
git checkout main && git pull
git tag ruby-v0.2.0
git push origin ruby-v0.2.0

# === Step 4: release-ruby.yml ===
# gem build && gem push（RubyGems OIDC Trusted Publishing）

# === Step 5: 確認 ===
gem search ^cao-holidays$
gem install cao-holidays -v 0.2.0
```

---

## Rust crate のリリース手順（Phase 4 以降）

### 1. 通常フロー（cargo release + tag-triggered）

```bash
cd packages/rust
cargo release minor --no-publish --no-tag    # Cargo.toml の version 更新のみ

git add Cargo.toml Cargo.lock CHANGELOG.md
git commit -m "chore(rust): bump to 0.2.0"
gh pr create --title "chore(rust): release 0.2.0"
# merge

git checkout main && git pull
git tag rust-v0.2.0
git push origin rust-v0.2.0
# release-rust.yml が cargo publish を実行
```

### 注意

- crates.io は OIDC Trusted Publishing **未対応**（2026-05 時点）。API token を `CARGO_REGISTRY_TOKEN` Secret に格納
- crates.io は yank できるが、削除はできない（npm/PyPI と同じ）

---

## PHP パッケージのリリース手順（Phase 4 以降）

### 1. 通常フロー（tag push + Packagist webhook）

```bash
cd packages/php
# composer.json に version を書かない流派が一般的（Packagist は tag から推論）
$EDITOR CHANGELOG.md

git commit -am "chore(php): release 0.2.0"
gh pr create --title "chore(php): release 0.2.0"
# merge

git checkout main && git pull
git tag php-v0.2.0
git push origin php-v0.2.0
# Packagist が webhook で取得（数分以内）

# 確認
composer show aromarious/cao-holidays
composer require aromarious/cao-holidays:^0.2
```

---

## リリース後チェックリスト（全言語共通）

リリース直後にやるべき確認:

- [ ] レジストリで新バージョンが見える（`npm view` / `pip index versions` / `gem search` / `cargo search` / `composer show` / pkg.go.dev）
- [ ] fresh install で動作する: JS は `npx cao-holidays@<ver> 2026`、Go は `go install .../cmd/cao-holidays@v<ver> && cao-holidays 2026`、Python/Ruby/Rust/PHP は library import / require のスモーク（CLI なし）
- [ ] GitHub Releases にエントリが作成されている（自動 or 手動）
- [ ] CHANGELOG が読める形に整っている
- [ ] ロードマップ Issue #14 のチェックボックスを更新
- [ ] 関連 Issue（#13 等）を close

## トラブルシュート

### Release PR が立たない（JS / Changesets）

1. `.changeset/*.md` がリポに存在するか確認: `ls packages/js/.changeset/`
2. `release-js.yml` の最新実行ログを確認: `gh run list --workflow=release-js.yml`
3. `changesets/action` が `cwd: packages/js` を見ているか workflow を確認

### tag を push したのに workflow が走らない

1. workflow の `on.push.tags` パターンが正しいか:
   - JS は Changesets が tag も作るので `tags: ['cao-holidays@*']` 等
   - Python: `tags: ['python-v*']`
   - Ruby: `tags: ['ruby-v*']`
   - Rust: `tags: ['rust-v*']`
2. `gh run list --workflow=release-python.yml` で起動を確認
3. 起動していなければ手動 trigger（`workflow_dispatch`）を試す

### npm/PyPI/RubyGems に publish できたが間違った内容を出してしまった

→ 次節「ロールバック」へ

## ロールバック・緊急対応

### npm（不正な publish の取り下げ）

```bash
# 72 時間以内なら unpublish 可能
npm unpublish cao-holidays@0.2.0   # 推奨せず、利用者が install 中なら壊す

# 72 時間超 or 推奨手順
npm deprecate cao-holidays@0.2.0 "Critical bug: please upgrade to 0.2.1"
# 即座に 0.2.1 を作って publish
```

### PyPI

- PyPI は **削除不可**。yank のみ:
  ```bash
  # Web UI: PyPI Project page → Releases → Yank
  # または twine で
  twine yank cao-holidays==0.2.0 --reason="Critical bug"
  ```
- yank しても `pip install cao-holidays==0.2.0` は動く（明示指定なら）。`pip install cao-holidays` (制約なし) では選ばれなくなる
- 同一バージョン名は **yank 後も再 upload 不可**。0.2.1 を出す

### RubyGems

```bash
gem yank cao-holidays -v 0.2.0
```

### crates.io

```bash
cargo yank --version 0.2.0 cao-holidays
# 取り消すなら
cargo yank --version 0.2.0 --undo cao-holidays
```

### Packagist

- Packagist 自体には削除機能なし。GitHub の tag を消すと Packagist の version も消える
- 推奨は新タグで上書きせず、新バージョンを切る

### 全言語共通の鉄則

1. **同じバージョン番号を再利用しない**（npm 以外は技術的に不可、npm も慣習として禁止）
2. **`--force` や hard-reset で履歴を改変しない**（OIDC provenance との整合が壊れる）
3. **慌てずに新バージョン**: 0.2.0 が壊れたら 0.2.1 を 30 分以内に出す方が、unpublish より影響が小さい

## 付録: 認証情報セットアップ手順

### npm OIDC Trusted Publisher（Phase 1 で設定済み、参考）

1. [npmjs.com](https://www.npmjs.com/) → Account → Packages → cao-holidays → Settings
2. Publishing access → Trusted Publishers → Add
3. Repository: `aromarious/cao-holidays`、Workflow filename: `release-js.yml`、Environment: 空 or `npm-publish`

### PyPI OIDC Trusted Publishing（Phase 2 着手時）

1. [pypi.org](https://pypi.org/) でプロジェクトを 1 度手動 publish（初回のみ手動 token 必要、または PyPI に「pending publisher」を事前登録して初回から OIDC で行く方法もある）
2. Project page → Settings → Publishing → Add a new publisher
3. Owner: `aromarious`、Repository: `cao-holidays`、Workflow: `release-python.yml`、Environment: `pypi`

### RubyGems OIDC Trusted Publishing（Phase 3 着手時）

1. [rubygems.org](https://rubygems.org/) → Settings → Trusted Publishers
2. GitHub Actions → Add: repo / workflow / environment

### crates.io API token（Phase 4 着手時）

1. [crates.io/me](https://crates.io/me) → Account Settings → API Tokens → New Token
2. Scope: `publish-update` 限定（`publish-new` は新規 crate 用、初回のみ）
3. GitHub Repo → Settings → Secrets → `CARGO_REGISTRY_TOKEN` に格納

### Packagist webhook（Phase 4 着手時）

1. [packagist.org](https://packagist.org/) → Submit → リポ URL を入力（初回のみ）
2. Settings → API token を取得 → GitHub repo の Webhooks に Packagist endpoint を追加（自動連携が最近は組み込みのはず、要確認）

---

## 改訂履歴

| 日付 | 改訂内容 |
|---|---|
| 2026-05-05 | 初版作成（JS/Python/Go/Ruby/Rust/PHP の手順、ロールバック、認証セットアップ） |
