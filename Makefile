# cao-holidays monorepo 横断開発タスク
#
# Phase 13: JS のみ。Python ターゲットは Phase 2 (multi-lang) で追加予定。

.PHONY: help install lint format test typecheck build
.PHONY: lint-js format-js test-js typecheck-js build-js install-js
.PHONY: sync-fixture generate-fixtures

help:
	@echo "cao-holidays monorepo make targets:"
	@echo ""
	@echo "  Development:"
	@echo "    make install            - 全言語の依存をインストール (現在は JS のみ)"
	@echo "    make lint               - 全言語の lint"
	@echo "    make format             - 全言語の format"
	@echo "    make test               - 全言語の test"
	@echo "    make typecheck          - 全言語の型チェック"
	@echo "    make build              - 全言語のビルド"
	@echo ""
	@echo "  Fixtures:"
	@echo "    make sync-fixture       - 内閣府の最新 CSV を fixtures/syukujitsu.csv に同期"
	@echo "    make generate-fixtures  - 期待出力 JSON/CSV/ICS を fixtures/ に再生成"
	@echo ""
	@echo "  Per-language (JS):"
	@echo "    make {install,lint,format,test,typecheck,build}-js"

# 横断
install: install-js
lint: lint-js
format: format-js
test: test-js
typecheck: typecheck-js
build: build-js

# JS
install-js:
	cd packages/js && pnpm install

lint-js:
	cd packages/js && pnpm lint

format-js:
	cd packages/js && pnpm format

test-js:
	cd packages/js && pnpm test

typecheck-js:
	cd packages/js && pnpm typecheck

build-js:
	cd packages/js && pnpm build

# Fixtures (root-level scripts)
sync-fixture:
	node scripts/sync-fixture.mjs

generate-fixtures:
	cd packages/js && node --import tsx ../../scripts/generate-fixtures.mjs

# Phase 2 (Python) で追加するターゲット:
# install-python:
# 	cd packages/python && uv sync
# lint-python:
# 	cd packages/python && uv run ruff check .
# format-python:
# 	cd packages/python && uv run ruff format .
# test-python:
# 	cd packages/python && uv run pytest
# typecheck-python:
# 	cd packages/python && uv run mypy src
