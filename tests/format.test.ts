import { describe, expect, it } from 'vitest'
import { formatCsv, formatIcs, formatJson } from '../src/format.ts'
import type { Holiday } from '../src/types.ts'

const sample: Holiday[] = [
  { date: '2026-01-01', name: '元日' },
  { date: '2026-01-12', name: '成人の日' },
]

describe('formatCsv', () => {
  it('emits an RFC 4180 CSV with header line and CRLF line endings', () => {
    const out = formatCsv(sample)
    expect(out).toBe(`${['date,name', '2026-01-01,元日', '2026-01-12,成人の日'].join('\r\n')}\r\n`)
  })

  it('only emits the header for an empty input', () => {
    expect(formatCsv([])).toBe('date,name\r\n')
  })

  it('quotes fields containing commas', () => {
    const out = formatCsv([{ date: '2026-01-01', name: 'A,B' }])
    expect(out).toBe('date,name\r\n2026-01-01,"A,B"\r\n')
  })

  it('quotes and doubles internal double-quotes', () => {
    const out = formatCsv([{ date: '2026-01-01', name: 'a "b" c' }])
    expect(out).toBe('date,name\r\n2026-01-01,"a ""b"" c"\r\n')
  })

  it('quotes fields containing CR or LF', () => {
    const out = formatCsv([{ date: '2026-01-01', name: 'a\nb' }])
    expect(out).toBe('date,name\r\n2026-01-01,"a\nb"\r\n')
  })
})

describe('formatJson', () => {
  it('emits a single-line JSON array', () => {
    const out = formatJson(sample)
    expect(out).toBe(
      '[{"date":"2026-01-01","name":"元日"},{"date":"2026-01-12","name":"成人の日"}]',
    )
  })

  it('emits [] for empty input', () => {
    expect(formatJson([])).toBe('[]')
  })
})

describe('formatIcs', () => {
  it('emits a VCALENDAR with one VEVENT per holiday and CRLF line endings', () => {
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

  it('uses VALUE=DATE with YYYYMMDD form and DTEND exclusive (next day)', () => {
    const out = formatIcs([{ date: '2026-01-01', name: '元日' }])
    expect(out).toContain('DTSTART;VALUE=DATE:20260101')
    expect(out).toContain('DTEND;VALUE=DATE:20260102')
    expect(out).toContain('SUMMARY:元日')
  })

  it('handles month-end DTEND rollover (2026-01-31 -> DTEND 2026-02-01)', () => {
    const out = formatIcs([{ date: '2026-01-31', name: 'X' }])
    expect(out).toContain('DTSTART;VALUE=DATE:20260131')
    expect(out).toContain('DTEND;VALUE=DATE:20260201')
  })

  it('handles year-end DTEND rollover (2026-12-31 -> DTEND 2027-01-01)', () => {
    const out = formatIcs([{ date: '2026-12-31', name: 'X' }])
    expect(out).toContain('DTSTART;VALUE=DATE:20261231')
    expect(out).toContain('DTEND;VALUE=DATE:20270101')
  })

  it('handles leap-day DTEND rollover (2024-02-29 -> DTEND 2024-03-01)', () => {
    const out = formatIcs([{ date: '2024-02-29', name: 'leap' }])
    expect(out).toContain('DTSTART;VALUE=DATE:20240229')
    expect(out).toContain('DTEND;VALUE=DATE:20240301')
  })

  it('escapes RFC 5545 special chars in SUMMARY (\\, ;, ,, newline)', () => {
    const out = formatIcs([{ date: '2026-01-01', name: 'a\\b;c,d\ne' }])
    expect(out).toContain('SUMMARY:a\\\\b\\;c\\,d\\ne')
  })

  it('produces deterministic UIDs based on date and product slug', () => {
    const a = formatIcs([{ date: '2026-01-01', name: '元日' }])
    const b = formatIcs([{ date: '2026-01-01', name: '元日' }])
    expect(a).toBe(b)
    expect(a).toContain('UID:2026-01-01@cao-holidays')
  })

  it('produces an empty VCALENDAR (no VEVENT) for empty input', () => {
    const out = formatIcs([])
    expect(out).not.toContain('BEGIN:VEVENT')
    expect(out).toContain('BEGIN:VCALENDAR')
    expect(out).toContain('END:VCALENDAR')
  })
})
