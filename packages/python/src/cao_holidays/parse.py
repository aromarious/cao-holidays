"""内閣府 CSV のパース（SJIS デコード + 構文解析）。"""

from __future__ import annotations

import re

from cao_holidays.errors import CaoHolidaysError
from cao_holidays.types import Holiday

_DATE_PATTERN = re.compile(r"^(\d{4})/(\d{1,2})/(\d{1,2})$")


def decode_sjis(data: bytes) -> str:
    """Shift_JIS でエンコードされたバイト列を Python の ``str`` (UTF-8 内部表現) にデコードする。

    Python の ``cp932`` codec は CAO CSV で実際に使われる Microsoft 拡張を含む Shift_JIS の
    superset であり、JS の ``TextDecoder('shift_jis')`` (WHATWG 仕様で実質 cp932 ベース) と
    バイト列レベルで同等の結果を返す。

    Args:
        data: SJIS バイト列

    Returns:
        UTF-8 文字列

    Raises:
        CaoHolidaysError: ``PARSE_FAILED`` (デコード失敗、想定しない byte sequence)
    """
    try:
        return data.decode("cp932")
    except UnicodeDecodeError as e:
        raise CaoHolidaysError("PARSE_FAILED", f"failed to decode CSV as Shift_JIS: {e}") from e


def parse_csv(text: str) -> list[Holiday]:
    """内閣府 CSV のテキストを ``list[Holiday]`` にパースする。

    - 先頭行（ヘッダー ``国民の祝日・休日月日,国民の祝日・休日名称``）はスキップ
    - 日付 ``YYYY/M/D`` を ``YYYY-MM-DD`` に正規化
    - 戻り値は日付昇順
    - 空行は無視
    - 不正な行は ``CaoHolidaysError(PARSE_FAILED)`` を投げる

    Args:
        text: CSV テキスト（UTF-8 にデコード済み）

    Returns:
        祝日エントリの配列（日付昇順）

    Raises:
        CaoHolidaysError: ``PARSE_FAILED`` (CSV 構文違反: comma 無し、日付不正、name 空)
    """
    lines = re.split(r"\r?\n", text)
    holidays: list[Holiday] = []

    # 先頭行 (header) を skip するため index 1 から開始
    for i, line in enumerate(lines[1:], start=2):
        if not line or not line.strip():
            continue

        idx = line.find(",")
        if idx < 0:
            raise CaoHolidaysError("PARSE_FAILED", f"CSV row {i} has no comma: {line}")

        raw_date = line[:idx].strip()
        name = line[idx + 1 :].strip()

        if name == "":
            raise CaoHolidaysError("PARSE_FAILED", f"CSV row {i} has empty name: {line}")

        date = _normalize_date(raw_date, i, line)
        holidays.append(Holiday(date=date, name=name))

    holidays.sort(key=lambda h: h.date)
    return holidays


def _normalize_date(raw: str, row_num: int, line: str) -> str:
    """``YYYY/M/D`` 形式の日付文字列を ``YYYY-MM-DD`` 形式に正規化する。"""
    m = _DATE_PATTERN.match(raw)
    if not m:
        raise CaoHolidaysError(
            "PARSE_FAILED",
            f"CSV row {row_num} has invalid date format (expected YYYY/M/D): {line}",
        )
    year, month, day = m.group(1), m.group(2).zfill(2), m.group(3).zfill(2)
    return f"{year}-{month}-{day}"
