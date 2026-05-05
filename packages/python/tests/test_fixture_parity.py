"""言語横断の振る舞い同一性テスト: JS 実装が生成した ``fixtures/*.json|csv|ics`` と
Python 実装の出力が **バイト単位で一致** することを検証する。

これに通ることが「Python 版が JS 版と同じ振る舞いをする」ことの証拠になる。
"""

from __future__ import annotations

from pathlib import Path

import httpx
import pytest
import respx

from cao_holidays import (
    fetch_all_holidays,
    fetch_holidays_between,
    fetch_holidays_by_year,
)
from cao_holidays.format import format_csv, format_ics, format_json
from cao_holidays.source import CKAN_URL

CSV_URL = "https://www8.cao.go.jp/chosei/shukujitsu/syukujitsu.csv"


@pytest.fixture
def mock_csv(syukujitsu_csv_bytes: bytes) -> respx.MockRouter:
    """CKAN + CSV をモックする ``respx`` ルータ。テスト関数から ``with`` で使う。"""
    router = respx.mock(assert_all_called=False)
    router.get(CKAN_URL).mock(
        return_value=httpx.Response(
            200,
            json={"success": True, "result": {"resources": [{"name": "csv", "url": CSV_URL}]}},
        )
    )
    router.get(CSV_URL).mock(return_value=httpx.Response(200, content=syukujitsu_csv_bytes))
    return router


def test_all_json_matches(fixtures_dir: Path, mock_csv: respx.MockRouter) -> None:
    """``fixtures/all.json`` が Python の ``fetch_all_holidays() | format_json`` と一致。"""
    expected_bytes = (fixtures_dir / "all.json").read_bytes()
    with mock_csv:
        holidays = fetch_all_holidays()
    # CLI の run() は formatJson() の戻り値をそのまま stdout に入れる（末尾改行なし）
    actual = format_json(holidays)
    assert actual.encode("utf-8") == expected_bytes


def test_2026_json_matches(fixtures_dir: Path, mock_csv: respx.MockRouter) -> None:
    """``fixtures/2026.json`` が ``fetch_holidays_by_year(2026)`` と一致。"""
    expected_bytes = (fixtures_dir / "2026.json").read_bytes()
    with mock_csv:
        holidays = fetch_holidays_by_year(2026)
    actual = format_json(holidays)
    assert actual.encode("utf-8") == expected_bytes


def test_2025_2027_json_matches(fixtures_dir: Path, mock_csv: respx.MockRouter) -> None:
    """``fixtures/2025-2027.json`` が JS と同じ「2025/2026/2027 年それぞれ別 fetch して連結」と一致。

    (JS の generate-fixtures.mjs はループで ``fetchHolidaysByYear(y)`` を呼んで結果を
     ``push`` するので、Python 側も同じ流れで生成する。)
    """
    expected_bytes = (fixtures_dir / "2025-2027.json").read_bytes()
    with mock_csv:
        combined = []
        for y in (2025, 2026, 2027):
            combined.extend(fetch_holidays_by_year(y))
    actual = format_json(combined)
    assert actual.encode("utf-8") == expected_bytes


def test_range_json_matches(fixtures_dir: Path, mock_csv: respx.MockRouter) -> None:
    """``fixtures/range-2026-04-01_2026-05-31.json`` が日付範囲 fetch と一致。"""
    expected_bytes = (fixtures_dir / "range-2026-04-01_2026-05-31.json").read_bytes()
    with mock_csv:
        holidays = fetch_holidays_between("2026-04-01", "2026-05-31")
    actual = format_json(holidays)
    assert actual.encode("utf-8") == expected_bytes


def test_2026_csv_matches(fixtures_dir: Path, mock_csv: respx.MockRouter) -> None:
    """``fixtures/2026.csv`` が ``fetch_holidays_by_year(2026) | format_csv`` と一致 (CRLF, UTF-8)。"""
    expected_bytes = (fixtures_dir / "2026.csv").read_bytes()
    with mock_csv:
        holidays = fetch_holidays_by_year(2026)
    actual = format_csv(holidays)
    assert actual.encode("utf-8") == expected_bytes


def test_2026_ics_matches(fixtures_dir: Path, mock_csv: respx.MockRouter) -> None:
    """``fixtures/2026.ics`` が ``fetch_holidays_by_year(2026) | format_ics`` と一致 (CRLF, UTF-8)。"""
    expected_bytes = (fixtures_dir / "2026.ics").read_bytes()
    with mock_csv:
        holidays = fetch_holidays_by_year(2026)
    actual = format_ics(holidays)
    assert actual.encode("utf-8") == expected_bytes
