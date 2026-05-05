/**
 * `src/index.ts` の公開ライブラリ API の統合テスト。
 * `fetchAllHolidays` / `fetchHolidaysByYear` / `fetchHolidaysBetween` を fake fetch + 実フィクスチャ CSV で実行し、
 * 結果の整列・絞り込み・入力バリデーション (INVALID_INPUT) ・カバレッジ判定 (OUT_OF_RANGE) を検証する。
 */
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { CaoHolidaysError } from '../src/errors.ts'
import { fetchAllHolidays, fetchHolidaysBetween, fetchHolidaysByYear } from '../src/index.ts'
import { CKAN_URL } from '../src/source.ts'

const fixturePath = fileURLToPath(new URL('../../../fixtures/syukujitsu.csv', import.meta.url))

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
  it('フィクスチャ全 1067 件を昇順で返す', async () => {
    const fetch = await makeFixtureFetch()
    const holidays = await fetchAllHolidays({ fetch })
    expect(holidays.length).toBe(1067)
    expect(holidays[0]).toEqual({ date: '1955-01-01', name: '元日' })
    expect(holidays.at(-1)).toEqual({ date: '2027-11-23', name: '勤労感謝の日' })
  })
})

describe('fetchHolidaysByYear', () => {
  it('指定年の祝日のみを返す', async () => {
    const fetch = await makeFixtureFetch()
    const holidays = await fetchHolidaysByYear(2026, { fetch })
    expect(holidays.length).toBeGreaterThan(0)
    for (const h of holidays) expect(h.date.startsWith('2026-')).toBe(true)
    expect(holidays[0]).toEqual({ date: '2026-01-01', name: '元日' })
  })

  it('NaN は INVALID_INPUT', async () => {
    const fetch = await makeFixtureFetch()
    await expectError(fetchHolidaysByYear(Number.NaN, { fetch }), 'INVALID_INPUT')
  })

  it('非整数 (1.5) は INVALID_INPUT', async () => {
    const fetch = await makeFixtureFetch()
    await expectError(fetchHolidaysByYear(1.5, { fetch }), 'INVALID_INPUT')
  })

  it('負数の年は INVALID_INPUT', async () => {
    const fetch = await makeFixtureFetch()
    await expectError(fetchHolidaysByYear(-1, { fetch }), 'INVALID_INPUT')
  })

  it('Infinity は INVALID_INPUT', async () => {
    const fetch = await makeFixtureFetch()
    await expectError(fetchHolidaysByYear(Number.POSITIVE_INFINITY, { fetch }), 'INVALID_INPUT')
  })

  it('CSV カバレッジより前の年 (1900) は OUT_OF_RANGE', async () => {
    const fetch = await makeFixtureFetch()
    await expectError(fetchHolidaysByYear(1900, { fetch }), 'OUT_OF_RANGE')
  })

  it('CSV カバレッジより後の年 (2100) は OUT_OF_RANGE', async () => {
    const fetch = await makeFixtureFetch()
    await expectError(fetchHolidaysByYear(2100, { fetch }), 'OUT_OF_RANGE')
  })
})

describe('fetchHolidaysBetween', () => {
  it('文字列引数で両端含む範囲の祝日を返す', async () => {
    const fetch = await makeFixtureFetch()
    const holidays = await fetchHolidaysBetween('2026-01-01', '2026-01-12', { fetch })
    expect(holidays).toEqual([
      { date: '2026-01-01', name: '元日' },
      { date: '2026-01-12', name: '成人の日' },
    ])
  })

  it('Date 引数を受け取り JST に正規化する', async () => {
    const fetch = await makeFixtureFetch()
    // Date inputs (UTC midnight on the boundary)
    const from = new Date('2026-01-01T00:00:00Z')
    const to = new Date('2026-01-12T00:00:00Z')
    const holidays = await fetchHolidaysBetween(from, to, { fetch })
    expect(holidays.length).toBeGreaterThanOrEqual(2)
    expect(holidays[0]).toEqual({ date: '2026-01-01', name: '元日' })
  })

  it('範囲内に祝日がなければ空配列を返す', async () => {
    const fetch = await makeFixtureFetch()
    // 2026-01-02 is a non-holiday weekday in the new year period
    const holidays = await fetchHolidaysBetween('2026-01-02', '2026-01-02', { fetch })
    expect(holidays).toEqual([])
  })

  it('不正な日付文字列は INVALID_INPUT', async () => {
    const fetch = await makeFixtureFetch()
    await expectError(fetchHolidaysBetween('2026/1/1', '2026-12-31', { fetch }), 'INVALID_INPUT')
  })

  it('from > to は INVALID_INPUT', async () => {
    const fetch = await makeFixtureFetch()
    await expectError(fetchHolidaysBetween('2026-12-31', '2026-01-01', { fetch }), 'INVALID_INPUT')
  })

  it('Date / string 以外の引数は INVALID_INPUT', async () => {
    const fetch = await makeFixtureFetch()
    await expectError(
      // biome-ignore lint/suspicious/noExplicitAny: testing invalid input
      fetchHolidaysBetween(123 as any, '2026-12-31', { fetch }),
      'INVALID_INPUT',
    )
  })

  it('両端が CSV カバレッジより前なら OUT_OF_RANGE', async () => {
    const fetch = await makeFixtureFetch()
    await expectError(fetchHolidaysBetween('1900-01-01', '1900-12-31', { fetch }), 'OUT_OF_RANGE')
  })

  it('両端が CSV カバレッジより後なら OUT_OF_RANGE', async () => {
    const fetch = await makeFixtureFetch()
    await expectError(fetchHolidaysBetween('2100-01-01', '2100-12-31', { fetch }), 'OUT_OF_RANGE')
  })

  it('範囲が CSV と一部重なるなら OUT_OF_RANGE にしない', async () => {
    const fetch = await makeFixtureFetch()
    // 1954 は範囲外、1955 は範囲内 — 1955 のみの祝日が返る
    const holidays = await fetchHolidaysBetween('1954-06-01', '1955-12-31', { fetch })
    expect(holidays.length).toBeGreaterThan(0)
    for (const h of holidays) expect(h.date.startsWith('1955-')).toBe(true)
  })
})
