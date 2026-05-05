# cao-holidays

> [日本語版](./README.md)

**`cao-holidays` is a multi-language monorepo that provides libraries and CLIs — with the same behavior across languages — for fetching Japan's *"National Holidays"* CSV (published by the Cabinet Office of Japan, 内閣府) at runtime.**

By **fetching the official CSV at runtime** ([Cabinet Office data](https://www8.cao.go.jp/chosei/shukujitsu/gaiyou.html)), this project sidesteps the typical weaknesses of holiday packages: static-dataset packages need a release before next year's data lands, and rule-based packages can't model holiday-law amendments or one-off holidays such as the imperial enthronement.

## Packages

| Language | Package | Registry | Status |
|---|---|---|---|
| **JavaScript / TypeScript** | [`packages/js/`](./packages/js/README.en.md) | [npm: cao-holidays](https://www.npmjs.com/package/cao-holidays) | ✅ released ([CHANGELOG](./packages/js/CHANGELOG.md)) |
| **Python** | `packages/python/` | (PyPI: cao-holidays) | 🚧 planned (Phase 2, see roadmap [#14](https://github.com/aromarious/cao-holidays/issues/14)) |
| **Go / Ruby / Rust / PHP** | (`packages/<lang>/`) | (per registry) | 🗓 future (Phase 3-4) |

Each language implementation is verified against the [`fixtures/`](./fixtures/README.md) snapshots so that all implementations produce **byte-identical output**.

## Quick start (JS)

```sh
npx cao-holidays 2026
# date,name
# 2026-01-01,元日
# 2026-01-12,成人の日
# ...
```

Full feature reference is in [`packages/js/README.en.md`](./packages/js/README.en.md).

## Repository layout

```
cao-holidays/
├── packages/
│   └── js/                  # JavaScript / TypeScript impl (npm: cao-holidays)
├── fixtures/                # Cross-language input CSV + expected outputs (JSON / CSV / ICS)
├── scripts/
│   ├── sync-fixture.mjs     # Sync fixtures/syukujitsu.csv with the upstream CSV
│   └── generate-fixtures.mjs # Regenerate expected outputs from the JS impl
├── docs/
│   ├── spec.md              # Language-agnostic spec (source of truth)
│   ├── monorepo-structure.md # Directory layout & design decisions
│   └── release-runbook.md   # Per-language release procedures
├── Makefile                 # Cross-language dev tasks (lint / format / test / ...)
├── .github/
│   └── workflows/           # ci-js.yml / release.yml / codeql.yml / healthcheck.yml
├── CONTRIBUTING.md
├── CODE_OF_CONDUCT.md
├── SECURITY.md
└── LICENSE
```

For the design rationale, see [`docs/monorepo-structure.md`](./docs/monorepo-structure.md). For release procedures, see [`docs/release-runbook.md`](./docs/release-runbook.md).

## Dev tasks

```sh
make help                # List all targets
make install             # Install deps for all languages (currently JS only)
make test                # Run tests across languages
make sync-fixture        # Sync the upstream CSV
make generate-fixtures   # Regenerate expected JSON / CSV / ICS outputs
```

Per-language targets use a `-<lang>` suffix, e.g. `make {lint,test,build}-js` (a `-python` set will land alongside the Python impl).

## Data source & license

- **Data**: Cabinet Office *"[National Holidays](https://www8.cao.go.jp/chosei/shukujitsu/gaiyou.html)"*. Governed by Japan's open-data policy (currently [Public Data Terms of Use v1.0](https://www.digital.go.jp/resources/open_data), effective 2024-07-05), which is compatible with [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
- **Attribution example**: *"Holiday data: Cabinet Office of Japan, "National Holidays" (https://www8.cao.go.jp/chosei/shukujitsu/gaiyou.html), used under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)."*
- **Code**: MIT licensed. See [LICENSE](./LICENSE).

## Contributing / reporting vulnerabilities

- See [CONTRIBUTING.md](./CONTRIBUTING.md) and [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md) for how to get involved.
- Vulnerabilities: please follow [SECURITY.md](./SECURITY.md) and use [GitHub Private Vulnerability Reporting](https://github.com/aromarious/cao-holidays/security/advisories/new) — do not open a public issue.
