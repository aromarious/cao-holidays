"""``cao_holidays.format`` のユニットテスト。

JS 実装とのバイト一致は ``test_fixture_parity.py`` で別途検証する。ここでは個別の
エスケープルール / RFC 準拠の細かいケースをチェックする。
"""

from __future__ import annotations

from cao_holidays.format import format_csv, format_ics, format_json
from cao_holidays.types import Holiday


def test_format_csv_basic() -> None:
    """ヘッダー + CRLF 行終端 + 末尾 CRLF を確認。"""
    result = format_csv([Holiday("2026-01-01", "元日"), Holiday("2026-01-12", "成人の日")])
    assert result == "date,name\r\n2026-01-01,元日\r\n2026-01-12,成人の日\r\n"


def test_format_csv_empty() -> None:
    """空配列でもヘッダー行 + CRLF を返す。"""
    assert format_csv([]) == "date,name\r\n"


def test_format_csv_quotes_comma() -> None:
    """name に ``,`` を含むとフィールドをクオートする。"""
    result = format_csv([Holiday("2026-01-01", "a,b")])
    assert result == 'date,name\r\n2026-01-01,"a,b"\r\n'


def test_format_csv_escapes_double_quote() -> None:
    """name に ``"`` を含むと ``""`` にエスケープ + 全体をクオート。"""
    result = format_csv([Holiday("2026-01-01", 'say "hi"')])
    assert result == 'date,name\r\n2026-01-01,"say ""hi"""\r\n'


def test_format_csv_quotes_newline() -> None:
    """name に改行を含むとクオートする（中身はそのまま）。"""
    result = format_csv([Holiday("2026-01-01", "line1\nline2")])
    assert result == 'date,name\r\n2026-01-01,"line1\nline2"\r\n'


def test_format_json_basic() -> None:
    """JSON は 1 行・空白なし・``ensure_ascii=False`` で日本語そのまま。"""
    result = format_json([Holiday("2026-01-01", "元日"), Holiday("2026-01-12", "成人の日")])
    assert result == '[{"date":"2026-01-01","name":"元日"},{"date":"2026-01-12","name":"成人の日"}]'


def test_format_json_empty() -> None:
    """空配列は ``[]``。"""
    assert format_json([]) == "[]"


def test_format_json_no_extra_spaces() -> None:
    """JS の ``JSON.stringify`` と同じく key/value 間にも空白を入れない。"""
    result = format_json([Holiday("2026-01-01", "元日")])
    assert " " not in result


def test_format_ics_basic() -> None:
    """RFC 5545 準拠の VCALENDAR、CRLF、末尾 CRLF を確認。"""
    result = format_ics([Holiday("2026-01-01", "元日")])
    expected = (
        "BEGIN:VCALENDAR\r\n"
        "VERSION:2.0\r\n"
        "PRODID:-//aromarious//cao-holidays//JP\r\n"
        "BEGIN:VEVENT\r\n"
        "UID:2026-01-01@cao-holidays\r\n"
        "DTSTART;VALUE=DATE:20260101\r\n"
        "DTEND;VALUE=DATE:20260102\r\n"
        "SUMMARY:元日\r\n"
        "END:VEVENT\r\n"
        "END:VCALENDAR\r\n"
    )
    assert result == expected


def test_format_ics_empty() -> None:
    """空配列でも VCALENDAR の最小構造を出す。"""
    result = format_ics([])
    assert result == "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//aromarious//cao-holidays//JP\r\nEND:VCALENDAR\r\n"


def test_format_ics_dtend_handles_month_end() -> None:
    """``DTEND`` の翌日計算が月末・年末・閏年を正しく扱う。"""
    # 1月31日 → 2月1日
    r1 = format_ics([Holiday("2026-01-31", "test")])
    assert "DTEND;VALUE=DATE:20260201" in r1
    # 12月31日 → 翌年1月1日
    r2 = format_ics([Holiday("2026-12-31", "test")])
    assert "DTEND;VALUE=DATE:20270101" in r2
    # 閏年 2/28 → 2/29
    r3 = format_ics([Holiday("2024-02-28", "test")])
    assert "DTEND;VALUE=DATE:20240229" in r3
    # 閏年 2/29 → 3/1
    r4 = format_ics([Holiday("2024-02-29", "test")])
    assert "DTEND;VALUE=DATE:20240301" in r4


def test_format_ics_escapes_text() -> None:
    """RFC 5545 TEXT 値の特殊文字をエスケープする。"""
    # `\` -> `\\`
    r1 = format_ics([Holiday("2026-01-01", "back\\slash")])
    assert "SUMMARY:back\\\\slash\r\n" in r1
    # `;` -> `\;`
    r2 = format_ics([Holiday("2026-01-01", "semi;colon")])
    assert "SUMMARY:semi\\;colon\r\n" in r2
    # `,` -> `\,`
    r3 = format_ics([Holiday("2026-01-01", "comma,here")])
    assert "SUMMARY:comma\\,here\r\n" in r3
    # 改行 -> `\n`
    r4 = format_ics([Holiday("2026-01-01", "line1\nline2")])
    assert "SUMMARY:line1\\nline2\r\n" in r4
