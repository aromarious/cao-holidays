# cao-holidays monorepo 横断開発タスク
#
# 現状: JS (packages/js/) と Python (packages/python/) の 2 言語。
# Phase 3 (Go / Ruby) と Phase 4 (Rust / PHP) で順次ターゲットを増やす。

.PHONY: help install lint format test typecheck build
.PHONY: lint-js format-js test-js typecheck-js build-js install-js
.PHONY: lint-python format-python test-python typecheck-python build-python install-python
.PHONY: sync-fixture generate-fixtures

help:
	@echo "cao-holidays monorepo make targets:"
	@echo ""
	@echo "  Development (横断):"
	@echo "    make install            - 全言語の依存をインストール"
	@echo "    make lint               - 全言語の lint"
	@echo "    make format             - 全言語の format"
	@echo "    make test               - 全言語の test"
	@echo "    make typecheck          - 全言語の型チェック"
	@echo "    make build              - 全言語のビルド"
	@echo ""
	@echo "  Fixtures (言語横断):"
	@echo "    make sync-fixture       - 内閣府の最新 CSV を fixtures/syukujitsu.csv に同期"
	@echo "    make generate-fixtures  - 期待出力 JSON/CSV/ICS を fixtures/ に再生成"
	@echo ""
	@echo "  Per-language:"
	@echo "    make {install,lint,format,test,typecheck,build}-{js,python}"

# 横断
install: install-js install-python
lint: lint-js lint-python
format: format-js format-python
test: test-js test-python
typecheck: typecheck-js typecheck-python
build: build-js build-python

# JS (pnpm workspace、root から install すると packages/js の deps も入る)
install-js:
	pnpm install

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

# Python (uv で管理、packages/python/.venv 配下の仮想環境を使う)
install-python:
	cd packages/python && uv sync

lint-python:
	cd packages/python && uv run ruff check .

format-python:
	cd packages/python && uv run ruff format .

test-python:
	cd packages/python && uv run pytest

typecheck-python:
	cd packages/python && uv run mypy src

build-python:
	cd packages/python && uv build

# Fixtures (root-level scripts)
sync-fixture:
	node scripts/sync-fixture.mjs

generate-fixtures:
	cd packages/js && node --import tsx ../../scripts/generate-fixtures.mjs
