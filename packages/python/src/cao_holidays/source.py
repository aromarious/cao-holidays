"""CKAN 経由で内閣府 CSV の URL を解決し、CSV テキストを取得するモジュール。"""

from __future__ import annotations

import contextlib
import logging
from typing import TYPE_CHECKING, Any, cast

import httpx

from cao_holidays.errors import CaoHolidaysError
from cao_holidays.parse import decode_sjis

if TYPE_CHECKING:
    from collections.abc import Iterator

    from cao_holidays.types import FetchOptions


_logger = logging.getLogger("cao_holidays")
"""``logging.getLogger("cao_holidays")`` で取れるモジュールロガー。

``logging.getLogger("cao_holidays").setLevel(logging.DEBUG)`` で fetch URL とバイト数を
デバッグ出力する。JS 版の ``DEBUG=cao-holidays`` に相当する。
"""

CKAN_URL: str = "https://data.e-gov.go.jp/data/api/action/package_show?id=cao_20190522_0002"
"""デジタル庁オープンデータカタログ（CKAN）の ``package_show`` API エンドポイント。"""


def _user_agent() -> str:
    """``cao-holidays/<version> (+<repo-url>)`` 形式の User-Agent を返す。

    ``__version__`` は import 時に ``cao_holidays/__init__.py`` から動的に解決する
    （Python 版固有のバージョンが入る）。
    """
    from cao_holidays import __version__

    return f"cao-holidays-py/{__version__} (+https://github.com/aromarious/cao-holidays)"


@contextlib.contextmanager
def _client_context(options: FetchOptions | None) -> Iterator[httpx.Client]:
    """``FetchOptions.client`` があればそれを使い、無ければ短命の ``httpx.Client`` を作る。

    User-Agent / timeout の共通化はここで行う。呼び出し側で渡された ``client`` を
    勝手に ``close`` しないよう、コンテキスト終了時の close は新規作成した場合のみ。
    """
    options = options or {}
    timeout = options.get("timeout")
    headers = {"User-Agent": _user_agent()}

    user_client = options.get("client")
    if user_client is not None:
        # 既存 client に headers / timeout を merge する（呼び出し側の他リクエストには影響させない）
        yield user_client
        return

    own = httpx.Client(headers=headers, timeout=timeout if timeout is not None else 5.0)
    try:
        yield own
    finally:
        own.close()


def _request(client: httpx.Client, url: str, options: FetchOptions | None) -> httpx.Response:
    """``client.get`` のラッパー。``timeout`` を毎リクエストに上書きできるようにする。"""
    options = options or {}
    timeout = options.get("timeout")
    headers = {"User-Agent": _user_agent()}
    if timeout is not None:
        return client.get(url, headers=headers, timeout=timeout)
    return client.get(url, headers=headers)


def resolve_csv_url(options: FetchOptions | None = None) -> str:
    """CKAN ``package_show`` API を叩いて CSV の実 URL を解決する。

    Args:
        options: ``FetchOptions``（``timeout`` / ``client``）

    Returns:
        CSV ファイルの URL（``resources[0].url``）

    Raises:
        CaoHolidaysError:
            ``FETCH_FAILED`` (ネットワーク / HTTP エラー / タイムアウト) /
            ``PARSE_FAILED`` (JSON 解析 / リソース欠落)
    """
    _logger.debug("resolving CSV URL via CKAN: %s", CKAN_URL)
    with _client_context(options) as client:
        try:
            res = _request(client, CKAN_URL, options)
        except httpx.HTTPError as e:
            raise CaoHolidaysError("FETCH_FAILED", f"failed to fetch CKAN metadata: {CKAN_URL}: {e}") from e

        if res.status_code >= 400:
            raise CaoHolidaysError(
                "FETCH_FAILED",
                f"CKAN metadata responded with HTTP {res.status_code}: {CKAN_URL}",
            )

        try:
            data = res.json()
        except ValueError as e:
            raise CaoHolidaysError("PARSE_FAILED", "CKAN metadata response is not valid JSON") from e

    url = _extract_first_resource_url(data)
    if url is None:
        raise CaoHolidaysError("PARSE_FAILED", "CKAN metadata response has no resources[0].url")
    _logger.debug("resolved CSV URL: %s", url)
    return url


def _extract_first_resource_url(data: object) -> str | None:
    """CKAN レスポンス JSON から ``result.resources[0].url`` を取り出す。

    型情報を持たない JSON を防御的に辿る。構造が想定外なら ``None``。
    """
    if not isinstance(data, dict):
        return None
    result = cast("dict[str, Any]", data).get("result")
    if not isinstance(result, dict):
        return None
    resources = cast("dict[str, Any]", result).get("resources")
    if not isinstance(resources, list) or len(resources) == 0:
        return None
    first = resources[0]
    if not isinstance(first, dict):
        return None
    url = cast("dict[str, Any]", first).get("url")
    return url if isinstance(url, str) else None


def fetch_csv_text(options: FetchOptions | None = None) -> str:
    """内閣府の祝日 CSV を取得し、SJIS デコード済みのテキストとして返す。

    1. CKAN ``package_show`` で実 URL を解決
    2. その URL から CSV をバイナリ取得
    3. ``cp932`` でデコード（``decode_sjis`` 経由）

    Args:
        options: ``FetchOptions``（``timeout`` / ``client``）

    Returns:
        CSV テキスト（UTF-8 ``str``）

    Raises:
        CaoHolidaysError: ``FETCH_FAILED`` / ``PARSE_FAILED``
    """
    url = resolve_csv_url(options)
    _logger.debug("fetching CSV: %s", url)
    with _client_context(options) as client:
        try:
            res = _request(client, url, options)
        except httpx.HTTPError as e:
            raise CaoHolidaysError("FETCH_FAILED", f"failed to fetch CSV: {url}: {e}") from e

        if res.status_code >= 400:
            raise CaoHolidaysError("FETCH_FAILED", f"CSV responded with HTTP {res.status_code}: {url}")

        body = res.content
        _logger.debug("fetched %d bytes", len(body))
        return decode_sjis(body)
