import type { Holiday } from './types.ts'

/**
 * `Holiday[]` を RFC 4180 準拠の CSV 文字列にフォーマットする。
 *
 * - 行終端は CRLF (`\r\n`)
 * - 1行目はヘッダー `date,name`
 * - `,` `"` `\r` `\n` を含むフィールドはダブルクオートで囲み、内部の `"` は `""` にエスケープ
 *
 * @param holidays - 祝日エントリ
 * @returns CSV テキスト（末尾は CRLF）
 */
export function formatCsv(holidays: readonly Holiday[]): string {
  const out: string[] = ['date,name']
  for (const h of holidays) {
    out.push(`${escapeCsvField(h.date)},${escapeCsvField(h.name)}`)
  }
  return `${out.join('\r\n')}\r\n`
}

/** RFC 4180 のクォート規則に従って1フィールドをエスケープ。 */
function escapeCsvField(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replaceAll('"', '""')}"`
  }
  return value
}

/**
 * `Holiday[]` を 1 行 JSON 文字列にフォーマットする。整形は行わない。
 *
 * @param holidays - 祝日エントリ
 * @returns JSON テキスト
 */
export function formatJson(holidays: readonly Holiday[]): string {
  return JSON.stringify(holidays)
}

/**
 * `Holiday[]` を RFC 5545 形式の `VCALENDAR` テキストにフォーマットする。
 *
 * - 各祝日を全日 `VEVENT` として出力
 * - `DTSTART`/`DTEND` は `VALUE=DATE` の `YYYYMMDD` 形式
 * - `DTEND` は exclusive（翌日を指定）
 * - `SUMMARY` は RFC 5545 の TEXT エスケープ規則に従う（`\` `;` `,` 改行）
 * - 行終端は CRLF (`\r\n`)
 *
 * @param holidays - 祝日エントリ
 * @returns ICS テキスト
 */
export function formatIcs(holidays: readonly Holiday[]): string {
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//aromarious//cao-holidays//JP',
  ]
  for (const h of holidays) {
    const dtstart = h.date.replaceAll('-', '')
    const dtend = nextDayCompact(h.date)
    lines.push(
      'BEGIN:VEVENT',
      `UID:${h.date}@cao-holidays`,
      `DTSTART;VALUE=DATE:${dtstart}`,
      `DTEND;VALUE=DATE:${dtend}`,
      `SUMMARY:${escapeIcsText(h.name)}`,
      'END:VEVENT',
    )
  }
  lines.push('END:VCALENDAR')
  return `${lines.join('\r\n')}\r\n`
}

/**
 * `YYYY-MM-DD` の翌日を `YYYYMMDD` 形式で返す（月末・年末・閏年を考慮）。
 *
 * @param yyyymmdd - `YYYY-MM-DD` 形式の入力
 * @returns 翌日を `YYYYMMDD` 形式で
 */
function nextDayCompact(yyyymmdd: string): string {
  const y = Number(yyyymmdd.slice(0, 4))
  const m = Number(yyyymmdd.slice(5, 7)) - 1 // JS Date month は 0-origin
  const d = Number(yyyymmdd.slice(8, 10))
  // UTC で扱えば DST の影響を受けない（日付計算なので OK）
  const next = new Date(Date.UTC(y, m, d + 1))
  const ny = String(next.getUTCFullYear()).padStart(4, '0')
  const nm = String(next.getUTCMonth() + 1).padStart(2, '0')
  const nd = String(next.getUTCDate()).padStart(2, '0')
  return `${ny}${nm}${nd}`
}

/**
 * RFC 5545 の TEXT 値エスケープ規則:
 * `\` → `\\`、`;` → `\;`、`,` → `\,`、改行（CR/LF）→ `\n`
 */
function escapeIcsText(value: string): string {
  return value
    .replaceAll('\\', '\\\\')
    .replaceAll(';', '\\;')
    .replaceAll(',', '\\,')
    .replaceAll(/\r\n|\r|\n/g, '\\n')
}
