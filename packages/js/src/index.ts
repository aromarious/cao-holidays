import { CaoHolidaysError } from './errors.ts'
import { parseCsv } from './parse.ts'
import { fetchCsvText } from './source.ts'
import type { FetchOptions, Holiday } from './types.ts'

export type { CaoHolidaysErrorCode } from './errors.ts'
export { CaoHolidaysError } from './errors.ts'
export type { FetchOptions, Holiday } from './types.ts'

/**
 * 内閣府CSV に収録されている全期間の祝日を取得する。
 *
 * 戻り値は日付昇順。同じプロセス内でも毎回 fetch する（ライブラリにキャッシュは無い）。
 *
 * @param options - fetch のキャンセル / DI 用オプション
 * @returns 全祝日の配列（日付昇順）
 * @throws {@link CaoHolidaysError} `FETCH_FAILED` / `PARSE_FAILED`
 */
export async function fetchAllHolidays(options?: FetchOptions): Promise<Holiday[]> {
  const text = await fetchCsvText(options)
  return parseCsv(text)
}

/**
 * 指定年（西暦）の祝日を取得する。
 *
 * @param year - 西暦年（例: `2026`）
 * @param options - fetch のキャンセル / DI 用オプション
 * @returns 該当年の祝日の配列（日付昇順）
 * @throws {@link CaoHolidaysError} `INVALID_INPUT` (NaN/非整数/負数) / `OUT_OF_RANGE` (CSV 収録範囲外) / `FETCH_FAILED` / `PARSE_FAILED`
 */
export async function fetchHolidaysByYear(
  year: number,
  options?: FetchOptions,
): Promise<Holiday[]> {
  if (!Number.isSafeInteger(year) || year < 0) {
    throw new CaoHolidaysError(
      'INVALID_INPUT',
      `year must be a non-negative safe integer, got: ${year}`,
    )
  }

  const all = await fetchAllHolidays(options)
  const prefix = `${String(year).padStart(4, '0')}-`
  const filtered = all.filter((h) => h.date.startsWith(prefix))

  if (filtered.length === 0) {
    throw new CaoHolidaysError('OUT_OF_RANGE', `year ${year} is not in the CSV coverage`)
  }
  return filtered
}

/**
 * 期間内（両端含む）の祝日を取得する。`from` と `to` はどちらが先でも比較は JST の `YYYY-MM-DD` 文字列で行う。
 *
 * - `string` 入力: `YYYY-MM-DD` 形式のみ受け付ける
 * - `Date` 入力: JST タイムゾーンの `YYYY-MM-DD` に正規化してから比較
 * - `from > to` は `INVALID_INPUT`
 * - `from` の年〜`to` の年がすべて CSV に存在しない場合は `OUT_OF_RANGE`
 *   （部分的にでも CSV と重なれば、該当期間の祝日が0件でも空配列を返す）
 *
 * @param from - 開始日（含む）
 * @param to - 終了日（含む）
 * @param options - fetch のキャンセル / DI 用オプション
 * @returns 範囲内の祝日の配列（日付昇順）
 * @throws {@link CaoHolidaysError} `INVALID_INPUT` / `OUT_OF_RANGE` / `FETCH_FAILED` / `PARSE_FAILED`
 */
export async function fetchHolidaysBetween(
  from: Date | string,
  to: Date | string,
  options?: FetchOptions,
): Promise<Holiday[]> {
  const fromStr = normalizeJstDate(from, 'from')
  const toStr = normalizeJstDate(to, 'to')

  if (fromStr > toStr) {
    throw new CaoHolidaysError('INVALID_INPUT', `from (${fromStr}) is after to (${toStr})`)
  }

  const all = await fetchAllHolidays(options)

  // OUT_OF_RANGE 判定: from 年〜to 年のいずれかが CSV にあるか
  const yearsInCsv = new Set<number>()
  for (const h of all) yearsInCsv.add(Number(h.date.slice(0, 4)))

  const fromYear = Number(fromStr.slice(0, 4))
  const toYear = Number(toStr.slice(0, 4))
  let anyYearCovered = false
  for (let y = fromYear; y <= toYear; y++) {
    if (yearsInCsv.has(y)) {
      anyYearCovered = true
      break
    }
  }
  if (!anyYearCovered) {
    throw new CaoHolidaysError(
      'OUT_OF_RANGE',
      `range ${fromStr}..${toStr} is entirely outside the CSV coverage`,
    )
  }

  return all.filter((h) => h.date >= fromStr && h.date <= toStr)
}

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

/**
 * `Date | string` を JST の `YYYY-MM-DD` 文字列に正規化する。
 *
 * - string: `YYYY-MM-DD` 形式チェックのみ（タイムゾーン情報は含まないので変換しない）
 * - Date: `Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo' })` で JST の年月日を取得
 *
 * @param value - 入力値
 * @param paramName - エラーメッセージ用の引数名
 * @returns 正規化済み `YYYY-MM-DD`
 * @throws {@link CaoHolidaysError} 形式違反 / 不正な型（`INVALID_INPUT`）
 */
function normalizeJstDate(value: Date | string, paramName: string): string {
  if (typeof value === 'string') {
    if (!ISO_DATE_PATTERN.test(value)) {
      throw new CaoHolidaysError(
        'INVALID_INPUT',
        `${paramName} must be a YYYY-MM-DD string, got: ${value}`,
      )
    }
    return value
  }
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      throw new CaoHolidaysError('INVALID_INPUT', `${paramName} is an invalid Date`)
    }
    return JST_FORMATTER.format(value)
  }
  throw new CaoHolidaysError(
    'INVALID_INPUT',
    `${paramName} must be a Date or YYYY-MM-DD string, got: ${typeof value}`,
  )
}

/** JST 固定で `YYYY-MM-DD`（ISO 8601 拡張形式）を返すフォーマッタ。 */
const JST_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Tokyo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})
