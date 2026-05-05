import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { CaoHolidaysError } from '../src/errors.ts'
import { fetchAllHolidays, fetchHolidaysBetween, fetchHolidaysByYear } from '../src/index.ts'
import { CKAN_URL } from '../src/source.ts'

const fixturePath = fileURLToPath(new URL('./fixtures/syukujitsu.csv', import.meta.url))

const CSV_URL = 'https://www8.cao.go.jp/chosei/shukujitsu/syukujitsu.csv'

const ckanResponseJson = {
  success: true,
  result: {
    resources: [{ name: '...', url: CSV_URL }],
  },
}

/** fixture を返す素朴な fake fetch を作る。 */
async function makeFixtureFetch() {
  const csvBuf = await readFile(fixturePath)
  const fetch: typeof globalThis.fetch = async (input) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    if (url === CKAN_URL) return new Response(JSON.stringify(ckanResponseJson))
    if (url === CSV_URL) return new Response(csvBuf)
    throw new Error(`unexpected url: ${url}`)
  }
  return fetch
}

/** 例外が CaoHolidaysError(code) であることを確認。 */
async function expectError(promise: Promise<unknown>, code: CaoHolidaysError['code']) {
  try {
    await promise
  } catch (e) {
    expect(e).toBeInstanceOf(CaoHolidaysError)
    if (e instanceof CaoHolidaysError) expect(e.code).toBe(code)
    return
  }
  throw new Error(`expected to throw CaoHolidaysError(${code}) but resolved`)
}

describe('fetchAllHolidays', () => {
  it('returns all 1067 holidays from the fixture, sorted ascending', async () => {
    const fetch = await makeFixtureFetch()
    const holidays = await fetchAllHolidays({ fetch })
    expect(holidays.length).toBe(1067)
    expect(holidays[0]).toEqual({ date: '1955-01-01', name: '元日' })
    expect(holidays.at(-1)).toEqual({ date: '2027-11-23', name: '勤労感謝の日' })
  })
})

describe('fetchHolidaysByYear', () => {
  it('returns only holidays for the specified year', async () => {
    const fetch = await makeFixtureFetch()
    const holidays = await fetchHolidaysByYear(2026, { fetch })
    expect(holidays.length).toBeGreaterThan(0)
    for (const h of holidays) expect(h.date.startsWith('2026-')).toBe(true)
    expect(holidays[0]).toEqual({ date: '2026-01-01', name: '元日' })
  })

  it('throws INVALID_INPUT for NaN', async () => {
    const fetch = await makeFixtureFetch()
    await expectError(fetchHolidaysByYear(Number.NaN, { fetch }), 'INVALID_INPUT')
  })

  it('throws INVALID_INPUT for non-integer (1.5)', async () => {
    const fetch = await makeFixtureFetch()
    await expectError(fetchHolidaysByYear(1.5, { fetch }), 'INVALID_INPUT')
  })

  it('throws INVALID_INPUT for negative year', async () => {
    const fetch = await makeFixtureFetch()
    await expectError(fetchHolidaysByYear(-1, { fetch }), 'INVALID_INPUT')
  })

  it('throws INVALID_INPUT for Infinity', async () => {
    const fetch = await makeFixtureFetch()
    await expectError(fetchHolidaysByYear(Number.POSITIVE_INFINITY, { fetch }), 'INVALID_INPUT')
  })

  it('throws OUT_OF_RANGE for year before CSV coverage (1900)', async () => {
    const fetch = await makeFixtureFetch()
    await expectError(fetchHolidaysByYear(1900, { fetch }), 'OUT_OF_RANGE')
  })

  it('throws OUT_OF_RANGE for year after CSV coverage (2100)', async () => {
    const fetch = await makeFixtureFetch()
    await expectError(fetchHolidaysByYear(2100, { fetch }), 'OUT_OF_RANGE')
  })
})

describe('fetchHolidaysBetween', () => {
  it('returns holidays within the inclusive range (string args)', async () => {
    const fetch = await makeFixtureFetch()
    const holidays = await fetchHolidaysBetween('2026-01-01', '2026-01-12', { fetch })
    expect(holidays).toEqual([
      { date: '2026-01-01', name: '元日' },
      { date: '2026-01-12', name: '成人の日' },
    ])
  })

  it('accepts Date arguments and normalizes to JST', async () => {
    const fetch = await makeFixtureFetch()
    // Date inputs (UTC midnight on the boundary)
    const from = new Date('2026-01-01T00:00:00Z')
    const to = new Date('2026-01-12T00:00:00Z')
    const holidays = await fetchHolidaysBetween(from, to, { fetch })
    expect(holidays.length).toBeGreaterThanOrEqual(2)
    expect(holidays[0]).toEqual({ date: '2026-01-01', name: '元日' })
  })

  it('returns empty array for an in-range period with no holidays', async () => {
    const fetch = await makeFixtureFetch()
    // 2026-01-02 is a non-holiday weekday in the new year period
    const holidays = await fetchHolidaysBetween('2026-01-02', '2026-01-02', { fetch })
    expect(holidays).toEqual([])
  })

  it('throws INVALID_INPUT for malformed date string', async () => {
    const fetch = await makeFixtureFetch()
    await expectError(fetchHolidaysBetween('2026/1/1', '2026-12-31', { fetch }), 'INVALID_INPUT')
  })

  it('throws INVALID_INPUT for from > to', async () => {
    const fetch = await makeFixtureFetch()
    await expectError(fetchHolidaysBetween('2026-12-31', '2026-01-01', { fetch }), 'INVALID_INPUT')
  })

  it('throws INVALID_INPUT for non-Date / non-string args', async () => {
    const fetch = await makeFixtureFetch()
    await expectError(
      // biome-ignore lint/suspicious/noExplicitAny: testing invalid input
      fetchHolidaysBetween(123 as any, '2026-12-31', { fetch }),
      'INVALID_INPUT',
    )
  })

  it('throws OUT_OF_RANGE when both endpoints precede CSV coverage', async () => {
    const fetch = await makeFixtureFetch()
    await expectError(fetchHolidaysBetween('1900-01-01', '1900-12-31', { fetch }), 'OUT_OF_RANGE')
  })

  it('throws OUT_OF_RANGE when both endpoints follow CSV coverage', async () => {
    const fetch = await makeFixtureFetch()
    await expectError(fetchHolidaysBetween('2100-01-01', '2100-12-31', { fetch }), 'OUT_OF_RANGE')
  })

  it('does NOT throw OUT_OF_RANGE when range partially overlaps CSV', async () => {
    const fetch = await makeFixtureFetch()
    // 1954 is out, 1955 is in — should return 1955-only holidays
    const holidays = await fetchHolidaysBetween('1954-06-01', '1955-12-31', { fetch })
    expect(holidays.length).toBeGreaterThan(0)
    for (const h of holidays) expect(h.date.startsWith('1955-')).toBe(true)
  })
})
