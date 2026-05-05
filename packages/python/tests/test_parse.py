"""``cao_holidays.parse`` のユニットテスト。"""

from __future__ import annotations

import pytest

from cao_holidays.errors import CaoHolidaysError
from cao_holidays.parse import decode_sjis, parse_csv


def test_decode_sjis_basic() -> None:
    """SJIS バイト列を UTF-8 文字列にデコードする。"""
    # '国民' を SJIS で表現
    bytes_kokumin = bytes([0x8D, 0x91, 0x96, 0xAF])
    assert decode_sjis(bytes_kokumin) == "国民"


def test_decode_sjis_invalid_raises() -> None:
    """不正な SJIS バイト列は ``CaoHolidaysError(PARSE_FAILED)`` を投げる。

    ``0x81`` は 2 バイト文字の lead byte（正常な後続は 0x40-0x7E / 0x80-0xFC）。
    後続が 0x00 だと illegal multibyte sequence になり cp932 がエラー化する。
    """
    invalid = bytes([0x81, 0x00])
    with pytest.raises(CaoHolidaysError) as exc_info:
        decode_sjis(invalid)
    assert exc_info.value.code == "PARSE_FAILED"


def test_parse_csv_skips_header() -> None:
    """先頭行（ヘッダー）はスキップする。"""
    text = "国民の祝日・休日月日,国民の祝日・休日名称\n2026/1/1,元日\n"
    result = parse_csv(text)
    assert len(result) == 1
    assert result[0].date == "2026-01-01"
    assert result[0].name == "元日"


def test_parse_csv_normalizes_date() -> None:
    """``YYYY/M/D`` を ``YYYY-MM-DD`` に正規化する（zero pad）。"""
    text = "header\n2026/1/5,テスト1\n2026/12/31,テスト2\n"
    result = parse_csv(text)
    assert [h.date for h in result] == ["2026-01-05", "2026-12-31"]


def test_parse_csv_sorts_ascending() -> None:
    """戻り値は日付昇順。"""
    text = "header\n2026/12/31,大晦日?\n2026/1/1,元日\n2026/5/5,こどもの日\n"
    result = parse_csv(text)
    assert [h.date for h in result] == ["2026-01-01", "2026-05-05", "2026-12-31"]


def test_parse_csv_skips_empty_lines() -> None:
    """空行・空白だけの行は無視する。"""
    text = "header\n\n2026/1/1,元日\n   \n2026/1/2,元日?\n"
    result = parse_csv(text)
    assert len(result) == 2


def test_parse_csv_handles_crlf() -> None:
    """CRLF / LF どちらでもパースできる。"""
    text = "header\r\n2026/1/1,元日\r\n2026/1/2,元日?\r\n"
    result = parse_csv(text)
    assert len(result) == 2


def test_parse_csv_throws_on_no_comma() -> None:
    """カンマが無い行は ``PARSE_FAILED`` を投げる。"""
    text = "header\n20260101元日\n"
    with pytest.raises(CaoHolidaysError) as exc_info:
        parse_csv(text)
    assert exc_info.value.code == "PARSE_FAILED"
    assert "no comma" in str(exc_info.value)


def test_parse_csv_throws_on_invalid_date() -> None:
    """``YYYY/M/D`` 形式違反の日付は ``PARSE_FAILED`` を投げる。"""
    text = "header\n2026-01-01,元日\n"  # ハイフン区切りは不正
    with pytest.raises(CaoHolidaysError) as exc_info:
        parse_csv(text)
    assert exc_info.value.code == "PARSE_FAILED"
    assert "invalid date format" in str(exc_info.value)


def test_parse_csv_throws_on_empty_name() -> None:
    """name が空の行は ``PARSE_FAILED`` を投げる。"""
    text = "header\n2026/1/1,\n"
    with pytest.raises(CaoHolidaysError) as exc_info:
        parse_csv(text)
    assert exc_info.value.code == "PARSE_FAILED"
    assert "empty name" in str(exc_info.value)


def test_parse_csv_real_fixture(syukujitsu_csv_bytes: bytes) -> None:
    """実フィクスチャ ``fixtures/syukujitsu.csv`` を最後まで通せる。"""
    text = decode_sjis(syukujitsu_csv_bytes)
    result = parse_csv(text)
    # 1955〜2027 の祝日が 1067 件含まれている（JS テストと同じ件数）
    assert len(result) == 1067
    # 昇順
    assert all(result[i].date <= result[i + 1].date for i in range(len(result) - 1))
    # 1955 年から始まる
    assert result[0].date.startswith("1955-")
    # JS フィクスチャと同じ最初のエントリ
    assert result[0].name == "元日"


def test_parse_csv_real_fixture_2026(syukujitsu_csv_bytes: bytes) -> None:
    """実フィクスチャから 2026 年の祝日を抽出すると 18 件（JS fixtures/2026.json と一致）。"""
    text = decode_sjis(syukujitsu_csv_bytes)
    result = parse_csv(text)
    y2026 = [h for h in result if h.date.startswith("2026-")]
    assert len(y2026) == 18
    assert y2026[0].date == "2026-01-01"
    assert y2026[0].name == "元日"
    assert y2026[-1].date == "2026-11-23"
    assert y2026[-1].name == "勤労感謝の日"
