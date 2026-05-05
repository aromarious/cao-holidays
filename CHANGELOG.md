# cao-holidays

## 0.2.0

### Minor Changes

- 4906d56: Add CLI retry support: `--retry <n>` (default 2, set 0 to disable) and `--retry-delay <ms>` (default 500). Retries on HTTP 5xx / 408 / 429 / network failures with exponential backoff + ±20% jitter, honoring `Retry-After`. `--timeout` is now a per-attempt timeout when combined with retry. Library API is unchanged.

## 0.1.0

### Minor Changes

- 70db8a6: Initial public release.

  - Library: `fetchAllHolidays` / `fetchHolidaysByYear` / `fetchHolidaysBetween` for fetching Japanese national holidays from the Cabinet Office (内閣府) CSV via the Digital Agency CKAN API.
  - CLI: `cao-holidays [<year>|<year>..<year>|<from>..<to>] [--format csv|json|ics] [--all] [--timeout <ms>]`.
  - ESM only, Node.js 22+, zero runtime dependencies (SJIS decoded with the standard `TextDecoder`).
  - Typed `CaoHolidaysError` with `INVALID_INPUT` / `OUT_OF_RANGE` / `FETCH_FAILED` / `PARSE_FAILED` codes.
  - `FetchOptions` with `signal` (AbortSignal) and `fetch` (DI for tests / proxies / CORS workaround).
  - Outputs: RFC 4180 CSV, single-line JSON, RFC 5545 ICS (all-day VEVENT, exclusive DTEND).
