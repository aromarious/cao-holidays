# cao-holidays (Python)

> 🗂 これは [`cao-holidays` multi-language monorepo](https://github.com/aromarious/cao-holidays) の **Python パッケージ**です。他言語の実装計画と全体像は [repo root の README](https://github.com/aromarious/cao-holidays#readme) を参照してください。

内閣府が公開している『国民の祝日』CSV を実行時に fetch して、`Holiday` のリストとして返す Python ライブラリ。

JavaScript / TypeScript 版 (`cao-holidays` on npm) と**同じ振る舞い**を提供しており、CSV / JSON / ICS の出力はバイト一致で検証されています（[`tests/test_fixture_parity.py`](https://github.com/aromarious/cao-holidays/blob/main/packages/python/tests/test_fixture_parity.py) 参照）。Python 版は **library only**（CLI は提供しません）。

## インストール

```sh
pip install cao-holidays
# uv add cao-holidays / poetry add cao-holidays
```

サポート Python: **3.11 / 3.12 / 3.13**

## クイックスタート

```python
from cao_holidays import (
    fetch_all_holidays,
    fetch_holidays_by_year,
    fetch_holidays_between,
    CaoHolidaysError,
    Holiday,
)

# 全件取得（CSV 収録の全期間、現状 1955〜翌年）
all_holidays: list[Holiday] = fetch_all_holidays()

# 年指定
y2026 = fetch_holidays_by_year(2026)
# => [Holiday(date='2026-01-01', name='元日'), ...]

# 期間指定（両端含む、YYYY-MM-DD 文字列）
gw = fetch_holidays_between("2026-04-29", "2026-05-06")

# エラーハンドリング
try:
    fetch_holidays_by_year(2999)
except CaoHolidaysError as e:
    print(e.code, str(e))
    # e.code: 'INVALID_INPUT' | 'OUT_OF_RANGE' | 'FETCH_FAILED' | 'PARSE_FAILED'
```

## 公開 API

| シンボル | 種別 | 概要 |
|---|---|---|
| `Holiday` | dataclass | `date: str (YYYY-MM-DD, JST)` + `name: str` |
| `FetchOptions` | TypedDict | `timeout: float \| None`, `client: httpx.Client \| None` 等 |
| `CaoHolidaysError` | Exception | `.code: 'INVALID_INPUT' \| 'OUT_OF_RANGE' \| 'FETCH_FAILED' \| 'PARSE_FAILED'` |
| `fetch_all_holidays(options=None)` | function | CSV 収録全期間 |
| `fetch_holidays_by_year(year, options=None)` | function | 指定年 |
| `fetch_holidays_between(from_, to, options=None)` | function | 指定期間（両端含む） |

詳細仕様は [`docs/spec.md`](https://github.com/aromarious/cao-holidays/blob/main/docs/spec.md) (JS パッケージの仕様書だが API 振る舞いは Python 版と一致) を参照。

## データソースとライセンス

- **データ**: 内閣府『[国民の祝日について](https://www8.cao.go.jp/chosei/shukujitsu/gaiyou.html)』。日本政府のオープンデータポリシー（[公共データ利用規約 第1.0版](https://www.digital.go.jp/resources/open_data)）に従い、[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) と互換
- **コード**: MIT ライセンス。詳細は [LICENSE](./LICENSE) を参照

## 脆弱性報告

[SECURITY.md](https://github.com/aromarious/cao-holidays/blob/main/SECURITY.md) を参照してください。public な issue ではなく [GitHub Private Vulnerability Reporting](https://github.com/aromarious/cao-holidays/security/advisories/new) 経由でお願いします。
