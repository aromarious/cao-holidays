---
'cao-holidays': minor
---

Add CLI retry support: `--retry <n>` (default 2, set 0 to disable) and `--retry-delay <ms>` (default 500). Retries on HTTP 5xx / 408 / 429 / network failures with exponential backoff + ±20% jitter, honoring `Retry-After`. `--timeout` is now a per-attempt timeout when combined with retry. Library API is unchanged.
