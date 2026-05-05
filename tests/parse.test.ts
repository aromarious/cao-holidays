/**
 * `src/parse.ts` のユニットテスト。
 * SJIS バイト列の UTF-8 デコード (`decodeSjis`) と、内閣府 CSV の構文解析・日付正規化・昇順整列・エラー化 (`parseCsv`) を検証する。
 */
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { CaoHolidaysError } from '../src/errors.ts'
import { decodeSjis, parseCsv } from '../src/parse.ts'

const fixturePath = fileURLToPath(new URL('./fixtures/syukujitsu.csv', import.meta.url))

describe('decodeSjis', () => {
  it('SJIS バイト列を UTF-8 文字列にデコードする', () => {
    const bytes = new Uint8Array([0x8d, 0x91, 0x96, 0xaf]) // '国民'
    expect(decodeSjis(bytes)).toBe('国民')
  })

  it('実フィクスチャファイルをデコードできる', async () => {
    const buf = await readFile(fixturePath)
    const text = decodeSjis(buf)
    expect(text.startsWith('国民の祝日・休日月日,国民の祝日・休日名称')).toBe(true)
  })
})

describe('parseCsv', () => {
  it('ヘッダー行をスキップする', () => {
    const text = ['国民の祝日・休日月日,国民の祝日・休日名称', '2026/1/1,元日'].join('\n')
    const result = parseCsv(text)
    expect(result).toEqual([{ date: '2026-01-01', name: '元日' }])
  })

  it('YYYY/M/D を YYYY-MM-DD にゼロ埋め正規化する', () => {
    const text = [
      '国民の祝日・休日月日,国民の祝日・休日名称',
      '2026/1/1,元日',
      '2026/1/12,成人の日',
      '2026/12/3,テスト',
    ].join('\n')
    const result = parseCsv(text)
    expect(result.map((h) => h.date)).toEqual(['2026-01-01', '2026-01-12', '2026-12-03'])
  })

  it('エントリを日付昇順で返す', () => {
    const text = [
      '国民の祝日・休日月日,国民の祝日・休日名称',
      '2026/12/3,テスト',
      '2026/1/1,元日',
      '2026/5/5,こどもの日',
    ].join('\n')
    const result = parseCsv(text)
    expect(result.map((h) => h.date)).toEqual(['2026-01-01', '2026-05-05', '2026-12-03'])
  })

  it('CRLF と末尾の空行を許容する', () => {
    const text = '国民の祝日・休日月日,国民の祝日・休日名称\r\n2026/1/1,元日\r\n\r\n'
    const result = parseCsv(text)
    expect(result).toEqual([{ date: '2026-01-01', name: '元日' }])
  })

  it('実フィクスチャ全件をパースできる（1955〜2027 の 1067 件）', async () => {
    const buf = await readFile(fixturePath)
    const text = decodeSjis(buf)
    const result = parseCsv(text)
    expect(result.length).toBe(1067)
    expect(result[0]).toEqual({ date: '1955-01-01', name: '元日' })
    expect(result.at(-1)).toEqual({ date: '2027-11-23', name: '勤労感謝の日' })
  })

  it('日付フォーマットが不正なら PARSE_FAILED を投げる', () => {
    const text = ['国民の祝日・休日月日,国民の祝日・休日名称', '20260101,bad'].join('\n')
    expect(() => parseCsv(text)).toThrowError(CaoHolidaysError)
    try {
      parseCsv(text)
    } catch (e) {
      expect(e).toBeInstanceOf(CaoHolidaysError)
      if (e instanceof CaoHolidaysError) expect(e.code).toBe('PARSE_FAILED')
    }
  })

  it('名称欠損行は PARSE_FAILED を投げる', () => {
    const text = ['国民の祝日・休日月日,国民の祝日・休日名称', '2026/1/1'].join('\n')
    expect(() => parseCsv(text)).toThrowError(CaoHolidaysError)
  })
})
