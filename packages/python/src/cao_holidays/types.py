"""cao-holidays の公開データ型。"""

from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING, TypedDict

if TYPE_CHECKING:
    import httpx


@dataclass(frozen=True, slots=True)
class Holiday:
    """祝日 1 件を表すイミュータブルなデータ型。

    - ``date``: ``YYYY-MM-DD`` 形式の文字列（JST）
    - ``name``: 内閣府公式の名称をそのまま（例: ``"元日"``）

    Holiday 同士は ``date`` の昇順で比較される（``Holiday[]`` をソートする目的）。
    """

    date: str
    name: str


class FetchOptions(TypedDict, total=False):
    """``fetch_*`` 系関数に渡すオプションコンテナ。

    - ``timeout``: per-attempt fetch タイムアウト（秒）。``None`` または未指定の場合は
      ``httpx`` のデフォルト（5秒）を使う。複数回 fetch する関数では各 attempt に同じ値が適用される
    - ``client``: ``httpx.Client`` の DI。テスト・プロキシ・カスタム HTTP 設定に使う。
      指定するとライブラリは新規 ``Client`` を作らず渡された ``Client`` を使う

    JS 実装の ``FetchOptions.signal`` に対応するキャンセルは Python では
    ``client`` を呼び出し側で閉じる / ``timeout`` を経由する形で表現する。
    """

    timeout: float | None
    client: httpx.Client | None
