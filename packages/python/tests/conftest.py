"""pytest fixtures: 言語横断の ``fixtures/`` ディレクトリへのパス解決。"""

from __future__ import annotations

from pathlib import Path

import pytest


@pytest.fixture
def fixtures_dir() -> Path:
    """repo root の ``fixtures/`` への絶対パス。

    packages/python/tests/conftest.py から見て ``../../../fixtures/``。
    JS テストの ``fixturePath`` (``packages/js/tests/*.test.ts``) と同じ場所を見る。
    """
    return Path(__file__).resolve().parents[3] / "fixtures"


@pytest.fixture
def syukujitsu_csv_bytes(fixtures_dir: Path) -> bytes:
    """``fixtures/syukujitsu.csv`` の生バイト列（SJIS のまま）。"""
    return (fixtures_dir / "syukujitsu.csv").read_bytes()
