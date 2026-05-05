/**
 * `src/cli.ts` の `run` 関数のテスト。
 * `--help` / `--version` から位置引数のディスパッチ（`<year>` / `<year>..<year>` / `<from>..<to>` / `--all`）、`--format` 出力、
 * バリデーションエラー (exit 1)、fetch 失敗 (exit 2) までを fake fetch で検証する。
 */
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
  it('--help は usage を表示して exit 0', async () => {
    const r = await run(['--help'])
    expect(r.code).toBe(0)
    expect(r.stdout).toMatch(/Usage:\s+cao-holidays/i)
    expect(r.stderr).toBe('')
  })

  it('-h は --help のエイリアス', async () => {
    const r = await run(['-h'])
    expect(r.code).toBe(0)
    expect(r.stdout).toMatch(/Usage:/i)
  })

  it('--version はパッケージバージョンを表示して exit 0', async () => {
    const r = await run(['--version'])
    expect(r.code).toBe(0)
    expect(r.stdout.trim()).toMatch(/^\d+\.\d+\.\d+/)
  })
})

describe('cli: 位置引数のディスパッチ', () => {
  it('<year> -> その年のみのヘッダ付き CSV', async () => {
    const fetch = await makeFetch()
    const r = await run(['2026'], { fetch })
    expect(r.code).toBe(0)
    expect(r.stdout.startsWith('date,name\r\n')).toBe(true)
    expect(r.stdout).toContain('2026-01-01,元日')
    expect(r.stdout).not.toContain('2025-')
    expect(r.stdout).not.toContain('2027-')
  })

  it('<year>..<year> -> 両端を含む年範囲の CSV', async () => {
    const fetch = await makeFetch()
    const r = await run(['2025..2027'], { fetch })
    expect(r.code).toBe(0)
    expect(r.stdout).toContain('2025-')
    expect(r.stdout).toContain('2026-')
    expect(r.stdout).toContain('2027-')
    expect(r.stdout).not.toContain('2024-')
  })

  it('<from>..<to> -> 両端を含む日付範囲の CSV', async () => {
    const fetch = await makeFetch()
    const r = await run(['2026-01-01..2026-01-31'], { fetch })
    expect(r.code).toBe(0)
    expect(r.stdout).toContain('2026-01-01,元日')
    expect(r.stdout).toContain('2026-01-12,成人の日')
    expect(r.stdout).not.toContain('2026-02-')
  })

  it('--all -> CSV カバレッジ全件の CSV', async () => {
    const fetch = await makeFetch()
    const r = await run(['--all'], { fetch })
    expect(r.code).toBe(0)
    expect(r.stdout).toContain('1955-01-01,元日')
    expect(r.stdout).toContain('2027-11-23,勤労感謝の日')
  })

  it('位置引数なし + --all なし -> 現在の年 (JST) を使う', async () => {
    const fetch = await makeFetch()
    const r = await run([], { fetch })
    // CSV は 2027 までカバー。今日が [1955..2027] にあれば行を返す。
    // 範囲外なら OUT_OF_RANGE -> exit 1。ここでは現行フィクスチャでの成功パスのみ検証。
    expect(r.code).toBe(0)
    const currentYear = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Tokyo',
      year: 'numeric',
    }).format(new Date())
    expect(r.stdout).toContain(`${currentYear}-`)
  })
})

describe('cli: --format', () => {
  it('--format json は単一行 JSON 配列を出力する', async () => {
    const fetch = await makeFetch()
    const r = await run(['2026', '--format', 'json'], { fetch })
    expect(r.code).toBe(0)
    expect(r.stdout.startsWith('[')).toBe(true)
    expect(r.stdout.endsWith(']')).toBe(true)
    expect(r.stdout).not.toContain('\n')
  })

  it('--format ics は VCALENDAR を出力する', async () => {
    const fetch = await makeFetch()
    const r = await run(['2026', '--format', 'ics'], { fetch })
    expect(r.code).toBe(0)
    expect(r.stdout).toContain('BEGIN:VCALENDAR')
    expect(r.stdout).toContain('END:VCALENDAR')
    expect(r.stdout).toContain('SUMMARY:元日')
  })

  it('--format に不正値 -> stderr 付きで exit 1', async () => {
    const r = await run(['2026', '--format', 'xml'])
    expect(r.code).toBe(1)
    expect(r.stderr).toMatch(/--format/)
  })
})

describe('cli: バリデーションエラー -> exit 1', () => {
  it('位置引数が複数 -> exit 1', async () => {
    const r = await run(['2026', '2027'])
    expect(r.code).toBe(1)
    expect(r.stderr).not.toBe('')
  })

  it('ISO でない日付形式 (2026/1/1) -> exit 1', async () => {
    const r = await run(['2026/1/1'])
    expect(r.code).toBe(1)
  })

  it('混在パターン (2025..2027-01-01) -> exit 1', async () => {
    const r = await run(['2025..2027-01-01'])
    expect(r.code).toBe(1)
  })

  it('--all と位置引数の併用 -> exit 1', async () => {
    const r = await run(['2026', '--all'])
    expect(r.code).toBe(1)
    expect(r.stderr).toMatch(/--all/i)
  })

  it('--timeout が非整数 -> exit 1', async () => {
    const r = await run(['2026', '--timeout', 'abc'])
    expect(r.code).toBe(1)
    expect(r.stderr).toMatch(/--timeout/i)
  })

  it('--timeout が負数 -> exit 1', async () => {
    const r = await run(['2026', '--timeout', '-100'])
    expect(r.code).toBe(1)
    expect(r.stderr).toMatch(/--timeout/i)
  })

  it('OUT_OF_RANGE な年 (1900) -> exit 1', async () => {
    const fetch = await makeFetch()
    const r = await run(['1900'], { fetch })
    expect(r.code).toBe(1)
    expect(r.stderr).not.toBe('')
  })
})

describe('cli: fetch 失敗 -> exit 2', () => {
  it('CKAN HTTP 500 -> exit 2', async () => {
    const fetch: typeof globalThis.fetch = async () => new Response('boom', { status: 500 })
    const r = await run(['2026'], { fetch })
    expect(r.code).toBe(2)
    expect(r.stderr).not.toBe('')
  })
})
