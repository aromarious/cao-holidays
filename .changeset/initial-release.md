---
"cao-holidays": minor
---

Initial public release.

- Library: `fetchAllHolidays` / `fetchHolidaysByYear` / `fetchHolidaysBetween` for fetching Japanese national holidays from the Cabinet Office (内閣府) CSV via the Digital Agency CKAN API.
- CLI: `cao-holidays [<year>|<year>..<year>|<from>..<to>] [--format csv|json|ics] [--all] [--timeout <ms>]`.
- ESM only, Node.js 22+, zero runtime dependencies (SJIS decoded with the standard `TextDecoder`).
- Typed `CaoHolidaysError` with `INVALID_INPUT` / `OUT_OF_RANGE` / `FETCH_FAILED` / `PARSE_FAILED` codes.
- `FetchOptions` with `signal` (AbortSignal) and `fetch` (DI for tests / proxies / CORS workaround).
- Outputs: RFC 4180 CSV, single-line JSON, RFC 5545 ICS (all-day VEVENT, exclusive DTEND).
