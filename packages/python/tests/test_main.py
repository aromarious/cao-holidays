"""``cao_holidays`` の公開関数 (``fetch_*``) のユニットテスト。

実通信せず、``respx`` で httpx をモックして CSV 取得経路を fixture バイト列に差し替える。
"""

from __future__ import annotations

import datetime

import httpx
import pytest
import respx

from cao_holidays import (
    CaoHolidaysError,
    fetch_all_holidays,
    fetch_holidays_between,
    fetch_holidays_by_year,
)
from cao_holidays.source import CKAN_URL

CSV_URL = "https://www8.cao.go.jp/chosei/shukujitsu/syukujitsu.csv"


def _setup_mock(mock: respx.Router, csv_bytes: bytes) -> None:
    mock.get(CKAN_URL).mock(
        return_value=httpx.Response(
            200,
            json={"success": True, "result": {"resources": [{"name": "csv", "url": CSV_URL}]}},
        )
    )
    mock.get(CSV_URL).mock(return_value=httpx.Response(200, content=csv_bytes))


# -- fetch_all_holidays --


@respx.mock
def test_fetch_all_holidays(syukujitsu_csv_bytes: bytes) -> None:
    """全件 1067 件を昇順で返す。"""
    _setup_mock(respx.mock, syukujitsu_csv_bytes)
    result = fetch_all_holidays()
    assert len(result) == 1067
    assert result[0].date.startswith("1955-")
    assert all(result[i].date <= result[i + 1].date for i in range(len(result) - 1))


# -- fetch_holidays_by_year --


@respx.mock
def test_fetch_holidays_by_year_2026(syukujitsu_csv_bytes: bytes) -> None:
    """2026 年は 18 件。"""
    _setup_mock(respx.mock, syukujitsu_csv_bytes)
    result = fetch_holidays_by_year(2026)
    assert len(result) == 18
    assert result[0].date == "2026-01-01"
    assert result[0].name == "元日"


@respx.mock
def test_fetch_holidays_by_year_zero_pad(syukujitsu_csv_bytes: bytes) -> None:
    """4 桁ゼロパディングで year prefix を作る（例: year=55 でも 0055-* は無く OUT_OF_RANGE）。"""
    _setup_mock(respx.mock, syukujitsu_csv_bytes)
    with pytest.raises(CaoHolidaysError) as exc_info:
        fetch_holidays_by_year(55)
    assert exc_info.value.code == "OUT_OF_RANGE"


@pytest.mark.parametrize("bad_year", [-1, "2026", 2026.0, None, True])
def test_fetch_holidays_by_year_invalid_input(bad_year: object) -> None:
    """非整数 / 負数 / bool は ``INVALID_INPUT``（fetch 前に判定）。"""
    with pytest.raises(CaoHolidaysError) as exc_info:
        fetch_holidays_by_year(bad_year)  # type: ignore[arg-type]
    assert exc_info.value.code == "INVALID_INPUT"


@respx.mock
def test_fetch_holidays_by_year_out_of_range(syukujitsu_csv_bytes: bytes) -> None:
    """CSV 収録範囲外の年は ``OUT_OF_RANGE``。"""
    _setup_mock(respx.mock, syukujitsu_csv_bytes)
    with pytest.raises(CaoHolidaysError) as exc_info:
        fetch_holidays_by_year(2999)
    assert exc_info.value.code == "OUT_OF_RANGE"


# -- fetch_holidays_between --


@respx.mock
def test_fetch_holidays_between_string(syukujitsu_csv_bytes: bytes) -> None:
    """``YYYY-MM-DD`` 文字列で範囲指定（両端含む）。"""
    _setup_mock(respx.mock, syukujitsu_csv_bytes)
    result = fetch_holidays_between("2026-04-29", "2026-05-06")
    # GW 期間: 昭和の日 / 憲法記念日 / みどりの日 / こどもの日 / 休日 = 5 件
    assert len(result) == 5
    assert result[0].date == "2026-04-29"
    assert result[-1].date == "2026-05-06"


@respx.mock
def test_fetch_holidays_between_date_object(syukujitsu_csv_bytes: bytes) -> None:
    """``datetime.date`` でも受け付ける。"""
    _setup_mock(respx.mock, syukujitsu_csv_bytes)
    result = fetch_holidays_between(datetime.date(2026, 4, 29), datetime.date(2026, 5, 6))
    assert len(result) == 5


@respx.mock
def test_fetch_holidays_between_datetime_aware(syukujitsu_csv_bytes: bytes) -> None:
    """tz-aware ``datetime`` は JST に正規化される。"""
    _setup_mock(respx.mock, syukujitsu_csv_bytes)
    # UTC 2026-01-01 00:00 = JST 2026-01-01 09:00
    utc = datetime.UTC
    result = fetch_holidays_between(
        datetime.datetime(2026, 1, 1, 0, 0, tzinfo=utc),
        datetime.datetime(2026, 1, 1, 23, 59, tzinfo=utc),
    )
    # JST では 2026-01-01 09:00 〜 2026-01-02 08:59 だが、日付列は 2026-01-01..2026-01-02 になる
    # → 元日 (2026-01-01) を含む
    assert any(h.date == "2026-01-01" for h in result)


@respx.mock
def test_fetch_holidays_between_empty_result(syukujitsu_csv_bytes: bytes) -> None:
    """範囲が CSV 内にあるが祝日が無い期間は空配列を返す（``OUT_OF_RANGE`` ではない）。"""
    _setup_mock(respx.mock, syukujitsu_csv_bytes)
    # 2026-06-01 〜 2026-06-30 は祝日無し
    result = fetch_holidays_between("2026-06-01", "2026-06-30")
    assert result == []


@respx.mock
def test_fetch_holidays_between_partial_overlap(syukujitsu_csv_bytes: bytes) -> None:
    """範囲の一部だけが CSV と重なる場合、重なり部分の祝日を返す。"""
    _setup_mock(respx.mock, syukujitsu_csv_bytes)
    # 2027 は CSV にあるが 3000 年は無い → 2027 年の祝日のみ返す
    result = fetch_holidays_between("2027-01-01", "3000-01-01")
    assert len(result) > 0
    assert all(h.date.startswith("2027-") for h in result)


@respx.mock
def test_fetch_holidays_between_completely_out_of_range(syukujitsu_csv_bytes: bytes) -> None:
    """範囲全体が CSV 外なら ``OUT_OF_RANGE``。"""
    _setup_mock(respx.mock, syukujitsu_csv_bytes)
    with pytest.raises(CaoHolidaysError) as exc_info:
        fetch_holidays_between("3000-01-01", "3001-01-01")
    assert exc_info.value.code == "OUT_OF_RANGE"


@pytest.mark.parametrize(
    "from_,to",
    [
        ("2026/01/01", "2026-01-31"),  # スラッシュ区切り
        ("2026-1-1", "2026-01-31"),  # zero pad なし
        ("not-a-date", "2026-01-31"),
        (12345, "2026-01-31"),  # int は不可
    ],
)
def test_fetch_holidays_between_invalid_input(from_: object, to: object) -> None:
    """不正な ``from_`` 入力は ``INVALID_INPUT``。"""
    with pytest.raises(CaoHolidaysError) as exc_info:
        fetch_holidays_between(from_, to)  # type: ignore[arg-type]
    assert exc_info.value.code == "INVALID_INPUT"


@respx.mock
def test_fetch_holidays_between_from_after_to(syukujitsu_csv_bytes: bytes) -> None:
    """``from > to`` は ``INVALID_INPUT``（fetch せずに即時失敗）。"""
    _setup_mock(respx.mock, syukujitsu_csv_bytes)
    with pytest.raises(CaoHolidaysError) as exc_info:
        fetch_holidays_between("2026-12-31", "2026-01-01")
    assert exc_info.value.code == "INVALID_INPUT"
    assert "after" in str(exc_info.value)
