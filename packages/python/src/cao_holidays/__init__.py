"""cao-holidays: 内閣府公式の祝日 CSV を実行時 fetch して返す薄い Python ライブラリ。

公開 API は JS 実装 (npm: ``cao-holidays``) と振る舞いを揃える。CSV / JSON / ICS 出力は
バイト一致の互換性があり、``fixtures/`` のスナップショットで担保される。

Python 版は **library only**（CLI は提供しない）。CLI が必要な場合は npm 版の
``npx cao-holidays`` を使う。
"""

from __future__ import annotations

import datetime
import re
from typing import TYPE_CHECKING

from cao_holidays.errors import CaoHolidaysError, CaoHolidaysErrorCode
from cao_holidays.parse import parse_csv
from cao_holidays.source import fetch_csv_text
from cao_holidays.types import FetchOptions, Holiday

if TYPE_CHECKING:
    pass

__version__ = "0.1.0"

__all__ = [
    "CaoHolidaysError",
    "CaoHolidaysErrorCode",
    "FetchOptions",
    "Holiday",
    "__version__",
    "fetch_all_holidays",
    "fetch_holidays_between",
    "fetch_holidays_by_year",
]


_ISO_DATE_PATTERN = re.compile(r"^\d{4}-\d{2}-\d{2}$")
_JST = datetime.timezone(datetime.timedelta(hours=9), name="JST")


def fetch_all_holidays(options: FetchOptions | None = None) -> list[Holiday]:
    """内閣府 CSV に収録されている全期間の祝日を取得する。

    戻り値は日付昇順。同じプロセス内でも毎回 fetch する（ライブラリにキャッシュは無い）。

    Args:
        options: fetch のキャンセル / DI 用オプション

    Returns:
        全祝日の配列（日付昇順）

    Raises:
        CaoHolidaysError: ``FETCH_FAILED`` / ``PARSE_FAILED``
    """
    text = fetch_csv_text(options)
    return parse_csv(text)


def fetch_holidays_by_year(year: int, options: FetchOptions | None = None) -> list[Holiday]:
    """指定年（西暦）の祝日を取得する。

    Args:
        year: 西暦年（例: ``2026``）
        options: fetch のキャンセル / DI 用オプション

    Returns:
        該当年の祝日の配列（日付昇順）

    Raises:
        CaoHolidaysError:
            ``INVALID_INPUT`` (非整数 / 負数 / bool) / ``OUT_OF_RANGE`` (CSV 収録範囲外) /
            ``FETCH_FAILED`` / ``PARSE_FAILED``
    """
    # bool は int の subclass なので明示的に弾く
    if isinstance(year, bool) or not isinstance(year, int) or year < 0:
        raise CaoHolidaysError(
            "INVALID_INPUT",
            f"year must be a non-negative integer, got: {year!r}",
        )

    all_holidays = fetch_all_holidays(options)
    prefix = f"{year:04d}-"
    filtered = [h for h in all_holidays if h.date.startswith(prefix)]

    if not filtered:
        raise CaoHolidaysError("OUT_OF_RANGE", f"year {year} is not in the CSV coverage")
    return filtered


def fetch_holidays_between(
    from_date: datetime.date | str,
    to_date: datetime.date | str,
    options: FetchOptions | None = None,
) -> list[Holiday]:
    """期間内（両端含む）の祝日を取得する。``from_date`` と ``to_date`` は JST の ``YYYY-MM-DD`` 文字列で比較する。

    - ``str`` 入力: ``YYYY-MM-DD`` 形式のみ受け付ける
    - ``datetime.date`` / ``datetime.datetime`` 入力: JST タイムゾーンの ``YYYY-MM-DD`` に正規化してから比較
    - ``from > to`` は ``INVALID_INPUT``
    - ``from`` の年〜``to`` の年がすべて CSV に存在しない場合は ``OUT_OF_RANGE``
      （部分的にでも CSV と重なれば、該当期間の祝日が0件でも空配列を返す）

    Args:
        from_date: 開始日（含む）
        to_date: 終了日（含む）
        options: fetch のキャンセル / DI 用オプション

    Returns:
        範囲内の祝日の配列（日付昇順）

    Raises:
        CaoHolidaysError: ``INVALID_INPUT`` / ``OUT_OF_RANGE`` / ``FETCH_FAILED`` / ``PARSE_FAILED``
    """
    from_str = _normalize_jst_date(from_date, "from_date")
    to_str = _normalize_jst_date(to_date, "to_date")

    if from_str > to_str:
        raise CaoHolidaysError("INVALID_INPUT", f"from_date ({from_str}) is after to_date ({to_str})")

    all_holidays = fetch_all_holidays(options)

    years_in_csv = {int(h.date[:4]) for h in all_holidays}
    from_year = int(from_str[:4])
    to_year = int(to_str[:4])
    any_year_covered = any(y in years_in_csv for y in range(from_year, to_year + 1))
    if not any_year_covered:
        raise CaoHolidaysError(
            "OUT_OF_RANGE",
            f"range {from_str}..{to_str} is entirely outside the CSV coverage",
        )

    return [h for h in all_holidays if from_str <= h.date <= to_str]


def _normalize_jst_date(value: datetime.date | str, param_name: str) -> str:
    """``date | datetime | str`` を JST の ``YYYY-MM-DD`` 文字列に正規化する。

    - ``str``: ``YYYY-MM-DD`` 形式チェックのみ（タイムゾーン情報は持たないので変換しない）
    - ``datetime.datetime`` (aware): JST に変換して ``YYYY-MM-DD``
    - ``datetime.datetime`` (naive): JST と仮定して ``YYYY-MM-DD``
    - ``datetime.date``: そのまま ``YYYY-MM-DD``
    """
    if isinstance(value, str):
        if not _ISO_DATE_PATTERN.match(value):
            raise CaoHolidaysError(
                "INVALID_INPUT",
                f"{param_name} must be a YYYY-MM-DD string, got: {value!r}",
            )
        return value
    if isinstance(value, datetime.datetime):
        # datetime は date のサブクラス。先に判定して JST に変換する
        if value.tzinfo is None:
            return value.strftime("%Y-%m-%d")
        return value.astimezone(_JST).strftime("%Y-%m-%d")
    if isinstance(value, datetime.date):
        return value.strftime("%Y-%m-%d")
    raise CaoHolidaysError(
        "INVALID_INPUT",
        f"{param_name} must be a date / datetime / YYYY-MM-DD string, got: {type(value).__name__}",
    )
