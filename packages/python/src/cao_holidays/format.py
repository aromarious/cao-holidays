"""``Holiday[]`` を CSV / JSON / ICS テキストに整形するフォーマッタ。

JS 実装 (``packages/js/src/format.ts``) とバイト一致する出力を返すことが要件。
``fixtures/`` 配下の期待出力に対する byte-for-byte 一致テストで担保する。
"""

from __future__ import annotations

import datetime
import json
import re
from collections.abc import Sequence

from cao_holidays.types import Holiday

_CSV_QUOTE_PATTERN = re.compile(r'[",\r\n]')
_ICS_NEWLINE_PATTERN = re.compile(r"\r\n|\r|\n")


def format_csv(holidays: Sequence[Holiday]) -> str:
    """``Holiday[]`` を RFC 4180 準拠の CSV 文字列に整形する。

    - 行終端は CRLF (``\\r\\n``)、末尾も CRLF を 1 つ付ける
    - 1 行目はヘッダー ``date,name``
    - ``,`` ``"`` ``\\r`` ``\\n`` を含むフィールドはダブルクオートで囲み、内部の ``"`` は ``""`` にエスケープ

    Args:
        holidays: 祝日エントリ

    Returns:
        CSV テキスト（末尾 CRLF）
    """
    out = ["date,name"]
    for h in holidays:
        out.append(f"{_escape_csv_field(h.date)},{_escape_csv_field(h.name)}")
    return "\r\n".join(out) + "\r\n"


def _escape_csv_field(value: str) -> str:
    """RFC 4180 のクォート規則に従って 1 フィールドをエスケープする。"""
    if _CSV_QUOTE_PATTERN.search(value):
        return '"' + value.replace('"', '""') + '"'
    return value


def format_json(holidays: Sequence[Holiday]) -> str:
    """``Holiday[]`` を 1 行の JSON 配列文字列に整形する。

    JS の ``JSON.stringify(holidays)`` と同じ出力を返すため、``ensure_ascii=False``
    （日本語をそのまま出力、UTF-8）かつ ``separators=(",", ":")``（要素間 / key:value 間に
    空白を入れない）を指定する。

    Args:
        holidays: 祝日エントリ

    Returns:
        JSON テキスト（改行なし）
    """
    payload = [{"date": h.date, "name": h.name} for h in holidays]
    return json.dumps(payload, ensure_ascii=False, separators=(",", ":"))


def format_ics(holidays: Sequence[Holiday]) -> str:
    """``Holiday[]`` を RFC 5545 形式の ``VCALENDAR`` テキストに整形する。

    - 各祝日を全日 ``VEVENT`` として出力
    - ``DTSTART`` / ``DTEND`` は ``VALUE=DATE`` の ``YYYYMMDD`` 形式
    - ``DTEND`` は exclusive（翌日を指定）
    - ``SUMMARY`` は RFC 5545 の TEXT エスケープ規則に従う（``\\`` ``;`` ``,`` 改行）
    - 行終端は CRLF (``\\r\\n``)、末尾も CRLF を 1 つ付ける

    Args:
        holidays: 祝日エントリ

    Returns:
        ICS テキスト（末尾 CRLF）
    """
    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//aromarious//cao-holidays//JP",
    ]
    for h in holidays:
        dtstart = h.date.replace("-", "")
        dtend = _next_day_compact(h.date)
        lines.extend(
            [
                "BEGIN:VEVENT",
                f"UID:{h.date}@cao-holidays",
                f"DTSTART;VALUE=DATE:{dtstart}",
                f"DTEND;VALUE=DATE:{dtend}",
                f"SUMMARY:{_escape_ics_text(h.name)}",
                "END:VEVENT",
            ]
        )
    lines.append("END:VCALENDAR")
    return "\r\n".join(lines) + "\r\n"


def _next_day_compact(yyyymmdd: str) -> str:
    """``YYYY-MM-DD`` の翌日を ``YYYYMMDD`` 形式で返す（月末・年末・閏年を考慮）。"""
    y, m, d = int(yyyymmdd[0:4]), int(yyyymmdd[5:7]), int(yyyymmdd[8:10])
    next_day = datetime.date(y, m, d) + datetime.timedelta(days=1)
    return next_day.strftime("%Y%m%d")


def _escape_ics_text(value: str) -> str:
    """RFC 5545 の TEXT 値エスケープ規則を適用する。

    - ``\\`` -> ``\\\\``
    - ``;`` -> ``\\;``
    - ``,`` -> ``\\,``
    - 改行 (CRLF / CR / LF) -> ``\\n``
    """
    out = value.replace("\\", "\\\\").replace(";", "\\;").replace(",", "\\,")
    return _ICS_NEWLINE_PATTERN.sub("\\\\n", out)
