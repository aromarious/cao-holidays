# Contributing to cao-holidays

このリポジトリへのコントリビュート方法をまとめます。Bug 修正、機能追加、ドキュメント改善、どれも歓迎します。

このリポジトリは monorepo で、現在は JavaScript / TypeScript 実装 ([`packages/js/`](./packages/js/README.md)) のみが入っています。Python 以降は [ロードマップ #14](https://github.com/aromarious/cao-holidays/issues/14) と [`docs/monorepo-structure.md`](./docs/monorepo-structure.md) を参照してください。

## 開発環境のセットアップ

- **Node.js**: 22 もしくは 24（LTS 系）。`.nvmrc` に 24 を pin しているので `nvm use` / `mise install` で揃います
- **pnpm**: `package.json` の `packageManager` フィールドを尊重するため、`corepack enable` 経由か mise などで自動取得が楽です
- 初回セットアップ:

  ```sh
  cd packages/js
  pnpm install
  pnpm test          # vitest run
  pnpm typecheck     # tsc --noEmit
  pnpm lint          # biome check .
  pnpm build         # tsup
  ```

  または repo root から `make install && make test` 等の横断ターゲットでも可（[`Makefile`](./Makefile) 参照）。

- フィクスチャ更新（CI のヘルスチェックで差分が検知された時など）:

  ```sh
  make sync-fixture        # fixtures/syukujitsu.csv を最新の内閣府 CSV に上書き
  make generate-fixtures   # 期待出力 JSON / CSV / ICS を再生成（CSV を更新したら必ず）
  ```

## ブランチ運用

- `main` は常にデプロイ可能な状態を保ちます。直 push は禁止（ruleset で block 済み）。
- 変更は `feature/<topic>` / `fix/<topic>` / `chore/<topic>` などのブランチで作業し、PR を経由して `main` にマージしてください。
- マージ方式は squash / rebase / merge いずれも可。Linear history が必須なので merge commit は fast-forward 相当に限られます。

## PR ガイド

- PR タイトル・本文は **日本語** で書いてください（コミットメッセージと `README.en.md` は英語のまま）
- JS パッケージへの変更には [changeset](https://github.com/changesets/changesets) を1つ追加してください:

  ```sh
  cd packages/js
  pnpm exec changeset
  # patch / minor / major と説明を入力 → packages/js/.changeset/<random>.md がコミット対象に
  ```

  バグ修正やドキュメント改善の場合は patch、後方互換のある機能追加は minor、破壊的変更は major（`0.x` のうちは minor で破壊的変更も含めて構いません）。
- changeset を**作らない**ケース（タイポ修正・内部リファクタなど）は `pnpm exec changeset --empty` で空 changeset を添付してください。
- PR テンプレートのチェックリストは目安です。すべて埋まっていなくても問題ありません。

## コミットメッセージ

- 本文は **英語**、内容は技術的な事実と意図を簡潔に
- conventional commits（`feat:` / `fix:` / `chore:` / `docs:` / `ci:` / `refactor:` / `test:` 等）に揃えてあります。Squash 時の自動タイトル整形のためにも従ってください

## コーディング規約 (JS)

- TypeScript `strict: true` + `noUncheckedIndexedAccess: true`
- Biome v2 系で format / lint。`cd packages/js && pnpm format` で auto-fix
- セミコロン無し（`semicolons: "asNeeded"`）
- すべての export に JSDoc を付ける（日本語）

## テスト (JS)

- Vitest を使用。`packages/js/tests/**/*.test.ts` 配下に配置
- 実通信は CI の定期ヘルスチェックに集約。ユニットテストは `FetchOptions.fetch` でモックしてください
- 入力フィクスチャは `fixtures/syukujitsu.csv`（SJIS のまま固定、repo root の言語横断ディレクトリ）。期待出力 (`fixtures/*.json`, `*.csv`, `*.ics`) は `make generate-fixtures` で再生成します

## バグ報告 / 機能要望

- [Issue templates](https://github.com/aromarious/cao-holidays/issues/new/choose) から起票してください（bug / feature の2種類）
- セキュリティ脆弱性は **public issue ではなく** [GitHub Private Vulnerability Reporting](https://github.com/aromarious/cao-holidays/security/advisories/new) でお願いします（[SECURITY.md](./SECURITY.md) 参照）

## 行動規範

[Contributor Covenant v2.1](./CODE_OF_CONDUCT.md) を採用しています。

## ライセンス

このリポジトリへの contribute は MIT License の下でリリースされることに同意したものとみなします。
