import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { run } from '../src/cli.ts'
import { CKAN_URL } from '../src/source.ts'

const fixturePath = fileURLToPath(new URL('./fixtures/syukujitsu.csv', import.meta.url))
const CSV_URL = 'https://www8.cao.go.jp/chosei/shukujitsu/syukujitsu.csv'

const ckanResponseJson = {
  success: true,
  result: { resources: [{ name: '...', url: CSV_URL }] },
}

async function makeFetch() {
  const csvBuf = await readFile(fixturePath)
  const fetch: typeof globalThis.fetch = async (input) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    if (url === CKAN_URL) return new Response(JSON.stringify(ckanResponseJson))
    if (url === CSV_URL) return new Response(csvBuf)
    throw new Error(`unexpected url: ${url}`)
  }
  return fetch
}

describe('cli: --help / --version', () => {
  it('--help prints usage and exits 0', async () => {
    const r = await run(['--help'])
    expect(r.code).toBe(0)
    expect(r.stdout).toMatch(/Usage:\s+cao-holidays/i)
    expect(r.stderr).toBe('')
  })

  it('-h is an alias for --help', async () => {
    const r = await run(['-h'])
    expect(r.code).toBe(0)
    expect(r.stdout).toMatch(/Usage:/i)
  })

  it('--version prints the package version and exits 0', async () => {
    const r = await run(['--version'])
    expect(r.code).toBe(0)
    expect(r.stdout.trim()).toMatch(/^\d+\.\d+\.\d+/)
  })
})

describe('cli: positional arg dispatch', () => {
  it('<year> -> CSV with header for that year only', async () => {
    const fetch = await makeFetch()
    const r = await run(['2026'], { fetch })
    expect(r.code).toBe(0)
    expect(r.stdout.startsWith('date,name\r\n')).toBe(true)
    expect(r.stdout).toContain('2026-01-01,元日')
    expect(r.stdout).not.toContain('2025-')
    expect(r.stdout).not.toContain('2027-')
  })

  it('<year>..<year> -> CSV across the inclusive year range', async () => {
    const fetch = await makeFetch()
    const r = await run(['2025..2027'], { fetch })
    expect(r.code).toBe(0)
    expect(r.stdout).toContain('2025-')
    expect(r.stdout).toContain('2026-')
    expect(r.stdout).toContain('2027-')
    expect(r.stdout).not.toContain('2024-')
  })

  it('<from>..<to> -> CSV across the inclusive date range', async () => {
    const fetch = await makeFetch()
    const r = await run(['2026-01-01..2026-01-31'], { fetch })
    expect(r.code).toBe(0)
    expect(r.stdout).toContain('2026-01-01,元日')
    expect(r.stdout).toContain('2026-01-12,成人の日')
    expect(r.stdout).not.toContain('2026-02-')
  })

  it('--all -> CSV with all entries from CSV coverage', async () => {
    const fetch = await makeFetch()
    const r = await run(['--all'], { fetch })
    expect(r.code).toBe(0)
    expect(r.stdout).toContain('1955-01-01,元日')
    expect(r.stdout).toContain('2027-11-23,勤労感謝の日')
  })

  it('no positional + no --all -> uses current year (JST)', async () => {
    const fetch = await makeFetch()
    const r = await run([], { fetch })
    // CSV covers up to 2027; if today is in [1955..2027] this returns rows.
    // If outside, OUT_OF_RANGE -> exit 1. Just assert successful path under current fixture.
    expect(r.code).toBe(0)
    const currentYear = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Tokyo',
      year: 'numeric',
    }).format(new Date())
    expect(r.stdout).toContain(`${currentYear}-`)
  })
})

describe('cli: --format', () => {
  it('--format json emits a single-line JSON array', async () => {
    const fetch = await makeFetch()
    const r = await run(['2026', '--format', 'json'], { fetch })
    expect(r.code).toBe(0)
    expect(r.stdout.startsWith('[')).toBe(true)
    expect(r.stdout.endsWith(']')).toBe(true)
    expect(r.stdout).not.toContain('\n')
  })

  it('--format ics emits a VCALENDAR', async () => {
    const fetch = await makeFetch()
    const r = await run(['2026', '--format', 'ics'], { fetch })
    expect(r.code).toBe(0)
    expect(r.stdout).toContain('BEGIN:VCALENDAR')
    expect(r.stdout).toContain('END:VCALENDAR')
    expect(r.stdout).toContain('SUMMARY:元日')
  })

  it('--format bogus -> exit 1 with stderr message', async () => {
    const r = await run(['2026', '--format', 'xml'])
    expect(r.code).toBe(1)
    expect(r.stderr).toMatch(/--format/)
  })
})

describe('cli: validation errors -> exit 1', () => {
  it('multiple positional args -> exit 1', async () => {
    const r = await run(['2026', '2027'])
    expect(r.code).toBe(1)
    expect(r.stderr).not.toBe('')
  })

  it('non-ISO date format (2026/1/1) -> exit 1', async () => {
    const r = await run(['2026/1/1'])
    expect(r.code).toBe(1)
  })

  it('mixed pattern (2025..2027-01-01) -> exit 1', async () => {
    const r = await run(['2025..2027-01-01'])
    expect(r.code).toBe(1)
  })

  it('--all combined with a positional -> exit 1', async () => {
    const r = await run(['2026', '--all'])
    expect(r.code).toBe(1)
    expect(r.stderr).toMatch(/--all/i)
  })

  it('--timeout non-integer -> exit 1', async () => {
    const r = await run(['2026', '--timeout', 'abc'])
    expect(r.code).toBe(1)
    expect(r.stderr).toMatch(/--timeout/i)
  })

  it('--timeout negative -> exit 1', async () => {
    const r = await run(['2026', '--timeout', '-100'])
    expect(r.code).toBe(1)
    expect(r.stderr).toMatch(/--timeout/i)
  })

  it('OUT_OF_RANGE year (1900) -> exit 1', async () => {
    const fetch = await makeFetch()
    const r = await run(['1900'], { fetch })
    expect(r.code).toBe(1)
    expect(r.stderr).not.toBe('')
  })
})

describe('cli: fetch failure -> exit 2', () => {
  it('CKAN HTTP 500 -> exit 2', async () => {
    const fetch: typeof globalThis.fetch = async () => new Response('boom', { status: 500 })
    const r = await run(['2026'], { fetch })
    expect(r.code).toBe(2)
    expect(r.stderr).not.toBe('')
  })
})
