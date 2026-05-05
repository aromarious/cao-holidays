# Changelog

All notable changes to the **Python** package of `cao-holidays` will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html) (with the SemVer 0.x relaxation that minor bumps may include breaking changes until 1.0.0 ships).

## [Unreleased]

## [0.1.0] - 2026-05-05

### Added

- 公開 API の実装:
  - `fetch_all_holidays(options)` / `fetch_holidays_by_year(year, options)` / `fetch_holidays_between(from_date, to_date, options)`
  - `Holiday` (`@dataclass(frozen=True, slots=True)`): `date: str (YYYY-MM-DD JST)` + `name: str`
  - `FetchOptions` (`TypedDict`): `timeout: float | None`, `client: httpx.Client | None`
  - `CaoHolidaysError`: `code` 属性で `INVALID_INPUT` / `OUT_OF_RANGE` / `FETCH_FAILED` / `PARSE_FAILED` を分類
- CSV / JSON / ICS 出力フォーマッタ (`format_csv` / `format_json` / `format_ics`): JS 実装と**バイト一致**する出力
- CKAN 経由の URL 解決 + Shift_JIS (cp932) デコード
- 言語横断 fixture (`fixtures/`) に対するバイト一致テスト (`tests/test_fixture_parity.py`)
- ロガー `cao_holidays`: `logging.getLogger("cao_holidays").setLevel(logging.DEBUG)` で fetch URL とバイト数をデバッグ出力 (JS 版の `DEBUG=cao-holidays` に相当)

### Notes

- Python 版は **library only**。CLI は提供しない（必要なら npm 版 `npx cao-holidays`）
- Python 3.11 / 3.12 / 3.13 でテスト済み
- JS 版 `cao-holidays@0.2.x` と同じ `fixtures/syukujitsu.csv` を入力した場合、CSV / JSON / ICS 出力はバイト単位で一致する

[Unreleased]: https://github.com/aromarious/cao-holidays/compare/python-v0.1.0...HEAD
[0.1.0]: https://github.com/aromarious/cao-holidays/releases/tag/python-v0.1.0
