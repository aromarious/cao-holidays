# Security Policy

## Supported Versions

Only the latest published version on npm receives security fixes during the
`0.x` development phase. Once `1.0.0` ships, this section will be updated with
a longer support window.

| Version | Supported |
|---------|-----------|
| 0.x     | latest minor only |

## Reporting a Vulnerability

**Please do not file a public issue.**

Use GitHub's private vulnerability reporting feature so the maintainer can
triage and patch before the details become public:

- https://github.com/aromarious/cao-holidays/security/advisories/new

Include, if possible:

- Package version (`npm view cao-holidays version` or your `package.json`)
- Node.js version
- Minimal reproduction (code or `cao-holidays --...` command line)
- The impact you observed and what you expected
- Whether this is already public somewhere (CVE / blog post / etc.)

You should receive an acknowledgement within **7 days**. We aim to ship a fix
or mitigation within **30 days** for confirmed high-severity issues, faster
for criticals. Coordinated disclosure timelines are negotiable — please tell
us if you have constraints.

## Scope

In scope:

- Code in this repository (`src/`, `bin/`, `scripts/`, `.github/workflows/`)
- Published `cao-holidays` package on npm
- Build and release pipeline (CI / Healthcheck / Release workflows)

Out of scope:

- Issues with the upstream Cabinet Office CSV itself or the e-gov CKAN API
  (please report those to the data publisher)
- Vulnerabilities in dependencies — please report directly upstream and let
  Dependabot pick up the fix here

## Hall of Fame

We don't currently run a paid bounty program, but valid reports get credit in
the release notes if you'd like.
