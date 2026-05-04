import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { CaoHolidaysError } from '../src/errors.ts'
import { decodeSjis, parseCsv } from '../src/parse.ts'

const fixturePath = fileURLToPath(new URL('./fixtures/syukujitsu.csv', import.meta.url))

describe('decodeSjis', () => {
  it('decodes SJIS-encoded bytes to UTF-8 string', () => {
    const bytes = new Uint8Array([0x8d, 0x91, 0x96, 0xaf]) // '国民'
    expect(decodeSjis(bytes)).toBe('国民')
  })

  it('decodes the real fixture file', async () => {
    const buf = await readFile(fixturePath)
    const text = decodeSjis(buf)
    expect(text.startsWith('国民の祝日・休日月日,国民の祝日・休日名称')).toBe(true)
  })
})

describe('parseCsv', () => {
  it('skips the header row', () => {
    const text = ['国民の祝日・休日月日,国民の祝日・休日名称', '2026/1/1,元日'].join('\n')
    const result = parseCsv(text)
    expect(result).toEqual([{ date: '2026-01-01', name: '元日' }])
  })

  it('normalizes YYYY/M/D dates to YYYY-MM-DD with zero-padding', () => {
    const text = [
      '国民の祝日・休日月日,国民の祝日・休日名称',
      '2026/1/1,元日',
      '2026/1/12,成人の日',
      '2026/12/3,テスト',
    ].join('\n')
    const result = parseCsv(text)
    expect(result.map((h) => h.date)).toEqual(['2026-01-01', '2026-01-12', '2026-12-03'])
  })

  it('returns entries sorted in ascending date order', () => {
    const text = [
      '国民の祝日・休日月日,国民の祝日・休日名称',
      '2026/12/3,テスト',
      '2026/1/1,元日',
      '2026/5/5,こどもの日',
    ].join('\n')
    const result = parseCsv(text)
    expect(result.map((h) => h.date)).toEqual(['2026-01-01', '2026-05-05', '2026-12-03'])
  })

  it('handles trailing CRLF and blank lines', () => {
    const text = '国民の祝日・休日月日,国民の祝日・休日名称\r\n2026/1/1,元日\r\n\r\n'
    const result = parseCsv(text)
    expect(result).toEqual([{ date: '2026-01-01', name: '元日' }])
  })

  it('parses the full real fixture (1067 holidays from 1955 to 2027)', async () => {
    const buf = await readFile(fixturePath)
    const text = decodeSjis(buf)
    const result = parseCsv(text)
    expect(result.length).toBe(1067)
    expect(result[0]).toEqual({ date: '1955-01-01', name: '元日' })
    expect(result.at(-1)).toEqual({ date: '2027-11-23', name: '勤労感謝の日' })
  })

  it('throws PARSE_FAILED on invalid date format', () => {
    const text = ['国民の祝日・休日月日,国民の祝日・休日名称', '20260101,bad'].join('\n')
    expect(() => parseCsv(text)).toThrowError(CaoHolidaysError)
    try {
      parseCsv(text)
    } catch (e) {
      expect(e).toBeInstanceOf(CaoHolidaysError)
      if (e instanceof CaoHolidaysError) expect(e.code).toBe('PARSE_FAILED')
    }
  })

  it('throws PARSE_FAILED on row with missing name', () => {
    const text = ['国民の祝日・休日月日,国民の祝日・休日名称', '2026/1/1'].join('\n')
    expect(() => parseCsv(text)).toThrowError(CaoHolidaysError)
  })
})
