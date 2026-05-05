"""Phase 13b の雛形が正しく公開 API の名前と契約を持っていることを最低限確認するテスト。

実装本体は Step 13c で追加されるので、このテストでは:

- ``__version__`` が文字列として import できる
- 公開 API 関数が import できて呼ぶと ``NotImplementedError`` を投げる
- ``CaoHolidaysError`` が ``code`` 属性を持つ

の3点だけを担保する。実装後はこのテストは置き換えられる。
"""

from __future__ import annotations

import pytest

from cao_holidays import (
    CaoHolidaysError,
    FetchOptions,
    Holiday,
    __version__,
    fetch_all_holidays,
    fetch_holidays_between,
    fetch_holidays_by_year,
)


def test_version_is_a_string() -> None:
    """``__version__`` が文字列として export されている。"""
    assert isinstance(__version__, str)
    assert __version__ != ""


def test_public_classes_are_importable() -> None:
    """公開型 / 例外クラスが import できる。"""
    assert Holiday is not None
    assert FetchOptions is not None
    assert issubclass(CaoHolidaysError, Exception)


def test_caoholidays_error_has_code() -> None:
    """``CaoHolidaysError`` は ``code`` 属性を持ち、コンストラクタで設定できる。"""
    err = CaoHolidaysError("INVALID_INPUT", "year must be a non-negative integer")
    assert err.code == "INVALID_INPUT"
    assert str(err) == "year must be a non-negative integer"


def test_fetch_all_holidays_is_unimplemented() -> None:
    """雛形段階では ``fetch_all_holidays`` は未実装。"""
    with pytest.raises(NotImplementedError):
        fetch_all_holidays()


def test_fetch_holidays_by_year_is_unimplemented() -> None:
    """雛形段階では ``fetch_holidays_by_year`` は未実装。"""
    with pytest.raises(NotImplementedError):
        fetch_holidays_by_year(2026)


def test_fetch_holidays_between_is_unimplemented() -> None:
    """雛形段階では ``fetch_holidays_between`` は未実装。"""
    with pytest.raises(NotImplementedError):
        fetch_holidays_between("2026-01-01", "2026-12-31")
