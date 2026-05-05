/**
 * `src/format.ts` のユニットテスト。
 * `Holiday[]` を CSV (RFC 4180) / 単一行 JSON / iCalendar (RFC 5545) にシリアライズする 3 関数のフォーマット・
 * エスケープ・ロールオーバー・空入力時の挙動を検証する。
 */
import { describe, expect, it } from 'vitest'
import { formatCsv, formatIcs, formatJson } from '../src/format.ts'
import type { Holiday } from '../src/types.ts'

const sample: Holiday[] = [
  { date: '2026-01-01', name: '元日' },
  { date: '2026-01-12', name: '成人の日' },
]

describe('formatCsv', () => {
  it('ヘッダー行と CRLF 改行を持つ RFC 4180 CSV を出力する', () => {
    const out = formatCsv(sample)
    expect(out).toBe(`${['date,name', '2026-01-01,元日', '2026-01-12,成人の日'].join('\r\n')}\r\n`)
  })

  it('空入力ならヘッダーのみを出力する', () => {
    expect(formatCsv([])).toBe('date,name\r\n')
  })

  it('カンマを含むフィールドはクォートする', () => {
    const out = formatCsv([{ date: '2026-01-01', name: 'A,B' }])
    expect(out).toBe('date,name\r\n2026-01-01,"A,B"\r\n')
  })

  it('内部のダブルクォートはクォート＆二重化する', () => {
    const out = formatCsv([{ date: '2026-01-01', name: 'a "b" c' }])
    expect(out).toBe('date,name\r\n2026-01-01,"a ""b"" c"\r\n')
  })

  it('CR / LF を含むフィールドはクォートする', () => {
    const out = formatCsv([{ date: '2026-01-01', name: 'a\nb' }])
    expect(out).toBe('date,name\r\n2026-01-01,"a\nb"\r\n')
  })
})

describe('formatJson', () => {
  it('単一行 JSON 配列を出力する', () => {
    const out = formatJson(sample)
    expect(out).toBe(
      '[{"date":"2026-01-01","name":"元日"},{"date":"2026-01-12","name":"成人の日"}]',
    )
  })

  it('空入力なら [] を出力する', () => {
    expect(formatJson([])).toBe('[]')
  })
})

describe('formatIcs', () => {
  it('祝日ごとに 1 VEVENT、CRLF 改行の VCALENDAR を出力する', () => {
    const out = formatIcs(sample)
    const lines = out.split('\r\n')
    expect(lines[0]).toBe('BEGIN:VCALENDAR')
    expect(lines).toContain('VERSION:2.0')
    expect(lines).toContain('PRODID:-//aromarious//cao-holidays//JP')
    expect(out.split('BEGIN:VEVENT').length - 1).toBe(2)
    expect(out.split('END:VEVENT').length - 1).toBe(2)
    expect(lines.at(-2)).toBe('END:VCALENDAR')
    expect(lines.at(-1)).toBe('')
  })

  it('VALUE=DATE (YYYYMMDD) と排他的 DTEND (翌日) を使う', () => {
    const out = formatIcs([{ date: '2026-01-01', name: '元日' }])
    expect(out).toContain('DTSTART;VALUE=DATE:20260101')
    expect(out).toContain('DTEND;VALUE=DATE:20260102')
    expect(out).toContain('SUMMARY:元日')
  })

  it('月末をまたぐ DTEND ロールオーバー (2026-01-31 -> DTEND 2026-02-01)', () => {
    const out = formatIcs([{ date: '2026-01-31', name: 'X' }])
    expect(out).toContain('DTSTART;VALUE=DATE:20260131')
    expect(out).toContain('DTEND;VALUE=DATE:20260201')
  })

  it('年末をまたぐ DTEND ロールオーバー (2026-12-31 -> DTEND 2027-01-01)', () => {
    const out = formatIcs([{ date: '2026-12-31', name: 'X' }])
    expect(out).toContain('DTSTART;VALUE=DATE:20261231')
    expect(out).toContain('DTEND;VALUE=DATE:20270101')
  })

  it('閏日をまたぐ DTEND ロールオーバー (2024-02-29 -> DTEND 2024-03-01)', () => {
    const out = formatIcs([{ date: '2024-02-29', name: 'leap' }])
    expect(out).toContain('DTSTART;VALUE=DATE:20240229')
    expect(out).toContain('DTEND;VALUE=DATE:20240301')
  })

  it('SUMMARY 内の RFC 5545 特殊文字 (\\, ;, ,, 改行) をエスケープする', () => {
    const out = formatIcs([{ date: '2026-01-01', name: 'a\\b;c,d\ne' }])
    expect(out).toContain('SUMMARY:a\\\\b\\;c\\,d\\ne')
  })

  it('日付と product slug から決定的な UID を生成する', () => {
    const a = formatIcs([{ date: '2026-01-01', name: '元日' }])
    const b = formatIcs([{ date: '2026-01-01', name: '元日' }])
    expect(a).toBe(b)
    expect(a).toContain('UID:2026-01-01@cao-holidays')
  })

  it('空入力なら VEVENT を含まない空 VCALENDAR を出力する', () => {
    const out = formatIcs([])
    expect(out).not.toContain('BEGIN:VEVENT')
    expect(out).toContain('BEGIN:VCALENDAR')
    expect(out).toContain('END:VCALENDAR')
  })
})
