import { CaoHolidaysError } from './errors.ts'
import type { Holiday } from './types.ts'

/**
 * Shift_JIS でエンコードされたバイト列を UTF-8 文字列にデコードする。
 *
 * `TextDecoder('shift_jis')` を使う zero-dep 実装。Node 22+ の full-icu ビルド前提。
 *
 * @param bytes - SJIS バイト列（`ArrayBuffer` / `Uint8Array` / `Buffer` いずれも可）
 * @returns デコード済み UTF-8 文字列
 */
export function decodeSjis(bytes: ArrayBuffer | Uint8Array): string {
  return new TextDecoder('shift_jis').decode(bytes)
}

const DATE_PATTERN = /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/

/**
 * 内閣府CSV のテキストを `Holiday[]` にパースする。
 *
 * - 先頭行（ヘッダー `国民の祝日・休日月日,国民の祝日・休日名称`）はスキップ
 * - 日付 `YYYY/M/D` を `YYYY-MM-DD` に正規化
 * - 戻り値は日付昇順
 * - 空行は無視
 * - 不正な行は `CaoHolidaysError(PARSE_FAILED)` を投げる
 *
 * @param text - CSV テキスト（UTF-8 にデコード済み）
 * @returns 祝日エントリの配列（日付昇順）
 */
export function parseCsv(text: string): Holiday[] {
  const lines = text.split(/\r?\n/)
  const holidays: Holiday[] = []

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]
    if (!line || line.trim() === '') continue

    const idx = line.indexOf(',')
    if (idx < 0) {
      throw new CaoHolidaysError('PARSE_FAILED', `CSV row ${i + 1} has no comma: ${line}`)
    }

    const rawDate = line.slice(0, idx).trim()
    const name = line.slice(idx + 1).trim()

    if (name === '') {
      throw new CaoHolidaysError('PARSE_FAILED', `CSV row ${i + 1} has empty name: ${line}`)
    }

    const date = normalizeDate(rawDate, i + 1, line)
    holidays.push({ date, name })
  }

  holidays.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
  return holidays
}

/**
 * `YYYY/M/D` 形式の日付文字列を `YYYY-MM-DD` 形式に正規化する。
 *
 * @param raw - 正規化前の日付文字列
 * @param rowNum - エラーメッセージ用の行番号（1-origin）
 * @param line - エラーメッセージ用の行内容
 * @returns 正規化後の `YYYY-MM-DD` 文字列
 * @throws {@link CaoHolidaysError} 形式が `YYYY/M/D` でない場合（`PARSE_FAILED`）
 */
function normalizeDate(raw: string, rowNum: number, line: string): string {
  const match = raw.match(DATE_PATTERN)
  if (!match) {
    throw new CaoHolidaysError(
      'PARSE_FAILED',
      `CSV row ${rowNum} has invalid date format (expected YYYY/M/D): ${line}`,
    )
  }
  const y = match[1]
  const m = match[2]?.padStart(2, '0')
  const d = match[3]?.padStart(2, '0')
  return `${y}-${m}-${d}`
}
