"""``cao_holidays.source`` のユニットテスト。

実通信は CI の healthcheck に集約。ここでは ``respx`` で httpx をモックして、
URL 解決 / HTTP エラー / JSON 構造違反のケースを検証する。
"""

from __future__ import annotations

import httpx
import pytest
import respx

from cao_holidays.errors import CaoHolidaysError
from cao_holidays.source import CKAN_URL, fetch_csv_text, resolve_csv_url

CSV_URL = "https://www8.cao.go.jp/chosei/shukujitsu/syukujitsu.csv"


def _ckan_response(csv_url: str = CSV_URL) -> dict[str, object]:
    """CKAN API の最小レスポンス構造。"""
    return {"success": True, "result": {"resources": [{"name": "syukujitsu.csv", "url": csv_url}]}}


@respx.mock
def test_resolve_csv_url_success() -> None:
    """CKAN レスポンスから ``resources[0].url`` を取り出す。"""
    respx.get(CKAN_URL).mock(return_value=httpx.Response(200, json=_ckan_response()))
    assert resolve_csv_url() == CSV_URL


@respx.mock
def test_resolve_csv_url_http_error() -> None:
    """HTTP 5xx は ``FETCH_FAILED``。"""
    respx.get(CKAN_URL).mock(return_value=httpx.Response(503))
    with pytest.raises(CaoHolidaysError) as exc_info:
        resolve_csv_url()
    assert exc_info.value.code == "FETCH_FAILED"
    assert "503" in str(exc_info.value)


@respx.mock
def test_resolve_csv_url_invalid_json() -> None:
    """JSON ではない応答は ``PARSE_FAILED``。"""
    respx.get(CKAN_URL).mock(return_value=httpx.Response(200, content=b"not json"))
    with pytest.raises(CaoHolidaysError) as exc_info:
        resolve_csv_url()
    assert exc_info.value.code == "PARSE_FAILED"


@respx.mock
def test_resolve_csv_url_missing_resources() -> None:
    """``resources`` が空 / 欠落していると ``PARSE_FAILED``。"""
    respx.get(CKAN_URL).mock(return_value=httpx.Response(200, json={"success": True, "result": {"resources": []}}))
    with pytest.raises(CaoHolidaysError) as exc_info:
        resolve_csv_url()
    assert exc_info.value.code == "PARSE_FAILED"
    assert "no resources" in str(exc_info.value)


@respx.mock
def test_resolve_csv_url_network_error() -> None:
    """ネットワーク失敗（接続不能）は ``FETCH_FAILED``、原因は ``__cause__`` に保持。"""
    respx.get(CKAN_URL).mock(side_effect=httpx.ConnectError("could not connect"))
    with pytest.raises(CaoHolidaysError) as exc_info:
        resolve_csv_url()
    assert exc_info.value.code == "FETCH_FAILED"
    assert isinstance(exc_info.value.__cause__, httpx.ConnectError)


@respx.mock
def test_fetch_csv_text_success(syukujitsu_csv_bytes: bytes) -> None:
    """CKAN から URL 解決 → CSV 取得 → SJIS デコードの一連が通る。"""
    respx.get(CKAN_URL).mock(return_value=httpx.Response(200, json=_ckan_response()))
    respx.get(CSV_URL).mock(return_value=httpx.Response(200, content=syukujitsu_csv_bytes))
    text = fetch_csv_text()
    # ヘッダー行が冒頭にあること
    assert text.startswith("国民の祝日・休日月日")
    # 中身は UTF-8 にデコード済み
    assert "元日" in text


@respx.mock
def test_fetch_csv_text_csv_404() -> None:
    """CSV 取得が 404 だと ``FETCH_FAILED``（CKAN 側は成功している前提）。"""
    respx.get(CKAN_URL).mock(return_value=httpx.Response(200, json=_ckan_response()))
    respx.get(CSV_URL).mock(return_value=httpx.Response(404))
    with pytest.raises(CaoHolidaysError) as exc_info:
        fetch_csv_text()
    assert exc_info.value.code == "FETCH_FAILED"
    assert "404" in str(exc_info.value)


@respx.mock
def test_fetch_csv_text_uses_injected_client(syukujitsu_csv_bytes: bytes) -> None:
    """``FetchOptions.client`` を渡せば、ライブラリは新規 ``Client`` を作らず DI 受け取った client を使う。"""
    respx.get(CKAN_URL).mock(return_value=httpx.Response(200, json=_ckan_response()))
    respx.get(CSV_URL).mock(return_value=httpx.Response(200, content=syukujitsu_csv_bytes))

    with httpx.Client(headers={"X-Custom": "yes"}) as client:
        text = fetch_csv_text({"client": client})
        assert text.startswith("国民の祝日・休日月日")


def test_fetch_csv_text_user_agent_set(syukujitsu_csv_bytes: bytes) -> None:
    """User-Agent ヘッダが ``cao-holidays-py/<version>`` 形式で送られる。"""
    captured: dict[str, str] = {}

    def transport_handler(request: httpx.Request) -> httpx.Response:
        captured[request.url.path or request.url.host] = request.headers.get("User-Agent", "")
        if str(request.url) == CKAN_URL:
            return httpx.Response(200, json=_ckan_response())
        return httpx.Response(200, content=syukujitsu_csv_bytes)

    transport = httpx.MockTransport(transport_handler)
    with httpx.Client(transport=transport) as client:
        fetch_csv_text({"client": client})

    # CKAN と CSV の両方のリクエストで UA が設定されている
    for ua in captured.values():
        assert ua.startswith("cao-holidays-py/")
        assert "github.com/aromarious/cao-holidays" in ua
