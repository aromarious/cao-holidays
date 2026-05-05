"""cao-holidays が投げる例外型の定義。"""

from __future__ import annotations

from typing import Literal

CaoHolidaysErrorCode = Literal[
    "INVALID_INPUT",
    "OUT_OF_RANGE",
    "FETCH_FAILED",
    "PARSE_FAILED",
]
"""``CaoHolidaysError`` が示すエラー種別。

- ``"INVALID_INPUT"``: 引数の型や形式が不正（例: ``year`` が整数でない、``from > to``、``YYYY-MM-DD`` 違反）
- ``"OUT_OF_RANGE"``: 引数自体は正しいが、CSV の収録範囲外（該当年の祝日が存在しない）
- ``"FETCH_FAILED"``: ネットワーク取得失敗、タイムアウト、HTTP エラー応答など
- ``"PARSE_FAILED"``: CSV のデコード・パース失敗、CKAN メタデータ JSON の構造違反
"""


class CaoHolidaysError(Exception):
    """cao-holidays が投げる唯一の例外クラス。

    利用者は ``except CaoHolidaysError as e`` で捕捉し、``e.code`` で原因を分岐する。
    元の例外がある場合は ``raise ... from e`` の形で ``__cause__`` 属性に保持される。

    Example:
        >>> try:
        ...     fetch_holidays_by_year(2026)
        ... except CaoHolidaysError as e:
        ...     if e.code == "FETCH_FAILED":
        ...         print("network error", e.__cause__)
    """

    code: CaoHolidaysErrorCode
    """エラー種別。"""

    def __init__(self, code: CaoHolidaysErrorCode, message: str) -> None:
        super().__init__(message)
        self.code = code
