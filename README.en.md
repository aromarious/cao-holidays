# cao-holidays

> [日本語版](./README.md)

A Node.js library + CLI that fetches Japan's *"National Holidays"*
CSV (published by the Cabinet Office, 内閣府) at runtime and returns it
as `Holiday[]` / CSV / JSON / ICS.

```sh
npx cao-holidays 2026
# date,name
# 2026-01-01,元日
# 2026-01-12,成人の日
# 2026-02-11,建国記念の日
# ...
```

### Why this exists

Existing JP-holiday packages fall into two camps, each with a weakness:

- **Static-dataset packages** (e.g. `@holiday-jp/holiday_jp`, the most
  popular one): next-year and ad-hoc holidays only land after a
  package release.
- **Rule-based packages** (e.g. `japanese-holidays` and several
  others): can't model holiday-law amendments or one-off holidays
  such as the imperial enthronement.

`cao-holidays` addresses both by **fetching the Cabinet Office CSV at
runtime**. When the official data is updated, you see it immediately —
no library release required.

### Highlights

- Source: [Cabinet Office CSV](https://www8.cao.go.jp/chosei/shukujitsu/gaiyou.html);
  URL resolved at runtime via the Digital Agency's CKAN `package_show` API.
- Zero runtime dependencies (SJIS decoded with the standard `TextDecoder`).
- ESM only / Node.js 22+ / TypeScript type definitions bundled.
- Library + CLI in a single package.
- Outputs CSV / JSON / ICS.

### How you're meant to use it

This package only does one thing: **fetch the dataset**. The intended
pattern is to **fetch once into your own store** (DB, KV, memory, S3,
file) and serve lookups from there — not to call it on every request.

**Example 1: build a JSON snapshot in CI and ship it**

```yml
# .github/workflows/holidays.yml
on:
  schedule: [{ cron: '0 0 5 2 *' }]  # Feb 5 every year (CAO refresh cycle)
  workflow_dispatch: {}
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - run: npx cao-holidays --all --format json > holidays.json
      - run: aws s3 cp holidays.json s3://my-bucket/holidays.json
```

**Example 2: load once at app start, look up in memory**

```ts
import { fetchAllHolidays } from 'cao-holidays'

const holidaySet = new Set((await fetchAllHolidays()).map((h) => h.date))

export function isHoliday(yyyyMmDd: string): boolean {
  return holidaySet.has(yyyyMmDd)
}
```

**Example 3: subscribe to it as an ICS calendar feed**

```sh
npx cao-holidays --all --format ics > jp-holidays.ics
# Import into Google Calendar / Apple Calendar / etc.
```

**Anti-pattern**: calling a fetch function per request or per event.
That round-trips the network every time and puts unnecessary load on
the Cabinet Office server. Fetch once, then look up locally.

## Install

```sh
npm install cao-holidays
# pnpm add cao-holidays
# yarn add cao-holidays
```

## Quick start (CLI)

```sh
# No args → today's JST year (CSV by default)
npx cao-holidays

# Single year
npx cao-holidays 2026

# Inclusive year range
npx cao-holidays 2025..2027

# Inclusive date range (ISO 8601, YYYY-MM-DD only)
npx cao-holidays 2026-04-01..2026-05-31

# All holidays in CSV coverage
npx cao-holidays --all

# JSON / ICS output
npx cao-holidays 2026 --format json
npx cao-holidays 2026 --format ics > 2026.ics

# Fetch timeout (default 30000ms) — see Caveats: Timeout
npx cao-holidays 2026 --timeout 5000
```

### Exit codes

| Code | Meaning |
|---|---|
| 0 | Success |
| 1 | Bad input / validation failure (`INVALID_INPUT`, `OUT_OF_RANGE`) |
| 2 | Fetch / parse failure (`FETCH_FAILED`, `PARSE_FAILED`) |

Error messages are written to stderr.

## Quick start (library)

```ts
import {
  fetchAllHolidays,
  fetchHolidaysByYear,
  fetchHolidaysBetween,
  CaoHolidaysError,
  type Holiday,
  type FetchOptions,
} from 'cao-holidays'

// All holidays in CSV coverage (currently 1955 .. next year)
// Hits the network on every call — see Caveats: No caching
const all = await fetchAllHolidays()

// Single year (Date inputs are normalized in JST — see Caveats: Time zone)
const y2026 = await fetchHolidaysByYear(2026)
// => [{ date: '2026-01-01', name: '元日' }, ...]

// Inclusive date range (Date or YYYY-MM-DD string)
const gw = await fetchHolidaysBetween('2026-04-29', '2026-05-06')

// Cancel / timeout via AbortSignal — see Caveats: Timeout
const ctrl = new AbortController()
setTimeout(() => ctrl.abort(), 3000)
await fetchHolidaysByYear(2026, { signal: ctrl.signal })
// or AbortSignal.timeout(ms) directly:
await fetchHolidaysByYear(2026, { signal: AbortSignal.timeout(5000) })

// Inject a custom fetch (proxy, tests) — see Caveats: Browsers
await fetchHolidaysByYear(2026, { fetch: myCustomFetch })

// Error handling
try {
  await fetchHolidaysByYear(2999)
} catch (e) {
  if (e instanceof CaoHolidaysError) {
    console.error(e.code, e.message, e.cause)
    // e.code: 'INVALID_INPUT' | 'OUT_OF_RANGE' | 'FETCH_FAILED' | 'PARSE_FAILED'
  }
}
```

### API reference

```ts
type Holiday = {
  date: string  // 'YYYY-MM-DD' (JST)
  name: string  // Cabinet Office name as-is (e.g. '元日')
}

type FetchOptions = {
  signal?: AbortSignal           // cancel / timeout
  fetch?: typeof fetch           // DI for tests / proxies / CORS workaround
}

class CaoHolidaysError extends Error {
  readonly code: 'INVALID_INPUT' | 'OUT_OF_RANGE' | 'FETCH_FAILED' | 'PARSE_FAILED'
}

function fetchAllHolidays(options?: FetchOptions): Promise<Holiday[]>
function fetchHolidaysByYear(year: number, options?: FetchOptions): Promise<Holiday[]>
function fetchHolidaysBetween(
  from: Date | string,
  to: Date | string,
  options?: FetchOptions,
): Promise<Holiday[]>
```

## Caveats

- **No caching.** Each call performs a fresh fetch. If you need multiple
  years, call `fetchHolidaysBetween` or `fetchAllHolidays` once instead
  of looping. The library does not cache even within a single process —
  wrap `FetchOptions.fetch` if you need caching.
- **Stale CKAN metadata.** The e-gov CKAN metadata stopped being updated
  on 2022-08-17, but `resources[0].url` still points at the live CSV.
- **Time zone.** All dates are JST. `Date` inputs are normalized to the
  JST `YYYY-MM-DD` form before comparison.
- **Browsers.** The Cabinet Office server does not return CORS headers,
  so you cannot call directly from the browser. Inject a `fetch` that
  goes through your own proxy via `FetchOptions.fetch`.
- **Timeout**:
  - **Library**: no automatic timeout. Pass
    `AbortSignal.timeout(ms)` (or your own `AbortController`'s signal)
    in `FetchOptions.signal` if you want one — see *Quick start
    (library)* above.
  - **CLI**: `--timeout <ms>` is always on (default 30000ms). The CLI
    creates an `AbortSignal.timeout` internally and forwards it to
    fetch, so even without passing the flag the default applies.

## Debug logging

Uses the [`debug`](https://github.com/debug-js/debug) package. Enable
with `DEBUG=cao-holidays`:

```sh
DEBUG=cao-holidays npx cao-holidays 2026
# 2026-05-05T... cao-holidays resolving CSV URL via CKAN: https://...
# 2026-05-05T... cao-holidays resolved CSV URL: https://www8.cao.go.jp/...
# 2026-05-05T... cao-holidays fetching CSV: https://www8.cao.go.jp/...
# 2026-05-05T... cao-holidays fetched 21538 bytes
```

## Data source & license

- **Data**: Cabinet Office *"[National Holidays](https://www8.cao.go.jp/chosei/shukujitsu/gaiyou.html)"*.
  Governed by Japan's open-data policy (currently
  [Public Data Terms of Use v1.0](https://www.digital.go.jp/resources/open_data),
  effective from 2024-07-05), which is compatible with
  [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
- **Attribution example**: *"Holiday data: Cabinet Office of Japan,*
  *"National Holidays" (https://www8.cao.go.jp/chosei/shukujitsu/gaiyou.html),*
  *used under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)."*
- **Library code**: MIT licensed. See [LICENSE](./LICENSE).
