"""cao-holidays: 内閣府公式の祝日 CSV を実行時 fetch して返す薄い Python ライブラリ。

このモジュールは Phase 2 (Step 13b) 時点では雛形のみ。実装は Step 13c で
追加される。公開 API のシグネチャと型・例外は JS 実装 (`packages/js/`) と
振る舞いを揃え、`fixtures/` のスナップショットでバイト一致を担保する。

JS 実装と異なり、Python パッケージは **library only**（CLI は提供しない）。
"""

from __future__ import annotations

__version__ = "0.0.0"

__all__ = [
    "CaoHolidaysError",
    "FetchOptions",
    "Holiday",
    "__version__",
    "fetch_all_holidays",
    "fetch_holidays_between",
    "fetch_holidays_by_year",
]


class CaoHolidaysError(Exception):
    """`cao-holidays` のすべての公開エラーが投げる基底例外。

    `code` 属性で原因の分類を持つ:

    - ``"INVALID_INPUT"``: 入力バリデーション失敗（不正な年、不正な日付文字列、from > to など）
    - ``"OUT_OF_RANGE"``: CSV 収録範囲外の年・期間が指定された
    - ``"FETCH_FAILED"``: ネットワーク失敗 / HTTP エラー / AbortError 等
    - ``"PARSE_FAILED"``: CSV のパース失敗（フォーマットが想定と違う等）

    元の例外があれば ``__cause__`` (= ``raise ... from e``) で保持する。
    """

    code: str

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code


class Holiday:
    """祝日 1 件を表すデータ型（Step 13c で dataclass として実装予定）。

    - ``date``: ``YYYY-MM-DD`` 形式の文字列（JST）
    - ``name``: 内閣府の名称をそのまま（例: ``"元日"``）
    """

    date: str
    name: str


class FetchOptions:
    """``fetch_*`` 系関数に渡すオプションコンテナ（Step 13c で TypedDict として実装予定）。

    - ``timeout``: per-attempt fetch タイムアウト（秒）
    - ``client``: ``httpx.Client`` の DI（テスト・プロキシ・CORS 回避）

    JS 実装の ``FetchOptions.signal`` / ``FetchOptions.fetch`` に対応する。
    """


def fetch_all_holidays(options: FetchOptions | None = None) -> list[Holiday]:
    """CSV 収録の全期間（現状 1955〜翌年）の祝日を返す。

    Step 13c で実装。現時点では `NotImplementedError` を投げる雛形のみ。
    """
    raise NotImplementedError("Phase 13c で実装予定")


def fetch_holidays_by_year(year: int, options: FetchOptions | None = None) -> list[Holiday]:
    """指定年の祝日を返す。

    Step 13c で実装。現時点では `NotImplementedError` を投げる雛形のみ。
    """
    raise NotImplementedError("Phase 13c で実装予定")


def fetch_holidays_between(
    from_date: str, to_date: str, options: FetchOptions | None = None
) -> list[Holiday]:
    """指定期間（両端含む、``YYYY-MM-DD`` 形式）の祝日を返す。

    Step 13c で実装。現時点では `NotImplementedError` を投げる雛形のみ。
    """
    raise NotImplementedError("Phase 13c で実装予定")
