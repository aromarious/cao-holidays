import { parseArgs } from 'node:util'
import pkg from '../package.json' with { type: 'json' }
import { CaoHolidaysError } from './errors.ts'
import { formatCsv, formatIcs, formatJson } from './format.ts'
import { fetchAllHolidays, fetchHolidaysBetween, fetchHolidaysByYear } from './index.ts'
import type { FetchOptions, Holiday } from './types.ts'

/** CLI 実行結果。 */
export type CliResult = {
  /** stdout に書き出すテキスト */
  stdout: string
  /** stderr に書き出すテキスト */
  stderr: string
  /** プロセス終了コード（0: 成功, 1: 入力エラー, 2: fetch / parse エラー） */
  code: 0 | 1 | 2
}

const FORMATS = ['csv', 'json', 'ics'] as const
type Format = (typeof FORMATS)[number]

const HELP_TEXT = `Usage:
  cao-holidays [<year>|<year>..<year>|<from>..<to>] [--format <csv|json|ics>] [--all] [--timeout <ms>]
  cao-holidays --help | --version

Arguments:
  <year>             Holidays for that year                  e.g. 2026
  <year>..<year>     Holidays across an inclusive year range e.g. 2025..2027
  <from>..<to>       Holidays across an inclusive date range e.g. 2025-04-01..2026-03-31
  (none)             Holidays for the current year (JST)

Options:
  --format <fmt>     Output format: csv (default) | json | ics
  --all              Output all holidays in CSV coverage (incompatible with positional args)
  --timeout <ms>     Fetch timeout in milliseconds (default: 30000)
  -h, --help         Show this help
  --version          Show version

Source: Cabinet Office (内閣府) of Japan via the e-gov CKAN API.
Output dates are JST. Library/CLI throws/exits on out-of-range or malformed input.
`

/**
 * CLI のメイン処理。`process.argv.slice(2)` を渡して呼ぶ想定。
 *
 * I/O 副作用（stdout/stderr/exit）は呼び出し側に委ね、結果オブジェクトを返す。
 *
 * @param args - 引数列（プログラム名は含まない）
 * @param injected - テスト/プロキシ用の fetch DI
 * @returns stdout / stderr / 終了コード
 */
export async function run(
  args: string[],
  injected: { fetch?: typeof fetch } = {},
): Promise<CliResult> {
  let flags: {
    format?: string
    all?: boolean
    timeout?: string
    help?: boolean
    version?: boolean
  }
  let positionals: string[]
  try {
    const parsed = parseArgs({
      args,
      options: {
        format: { type: 'string' },
        all: { type: 'boolean' },
        timeout: { type: 'string' },
        help: { type: 'boolean', short: 'h' },
        version: { type: 'boolean' },
      },
      allowPositionals: true,
      strict: true,
    })
    flags = parsed.values
    positionals = parsed.positionals
  } catch (e) {
    return fail(1, `argument error: ${(e as Error).message}`)
  }

  if (flags.help) return ok(HELP_TEXT)
  if (flags.version) return ok(`${pkg.version}\n`)

  // --format
  const format = (flags.format ?? 'csv') as string
  if (!isFormat(format)) {
    return fail(1, `--format must be one of ${FORMATS.join(', ')}, got: ${format}`)
  }

  // --timeout
  const timeoutMs = parseTimeout(flags.timeout)
  if (timeoutMs instanceof Error) return fail(1, timeoutMs.message)

  // 引数組み合わせの検証
  if (flags.all && positionals.length > 0) {
    return fail(1, '--all cannot be combined with a positional argument')
  }
  if (positionals.length > 1) {
    return fail(1, `expected at most 1 positional argument, got ${positionals.length}`)
  }

  // タイムアウト用 AbortSignal の生成（テストで fetch DI が来ても透過に渡す）
  const signal = AbortSignal.timeout(timeoutMs)
  const fetchOpts: FetchOptions = {
    signal,
    ...(injected.fetch ? { fetch: injected.fetch } : {}),
  }

  try {
    const holidays = await dispatch(positionals[0], flags.all === true, fetchOpts)
    return ok(serialize(holidays, format))
  } catch (e) {
    if (e instanceof CaoHolidaysError) {
      const code: 1 | 2 = e.code === 'INVALID_INPUT' || e.code === 'OUT_OF_RANGE' ? 1 : 2
      return fail(code, `${e.code}: ${e.message}`)
    }
    return fail(2, (e as Error).message ?? String(e))
  }
}

/**
 * 位置引数と `--all` から呼ぶライブラリ関数を選び実行する。
 *
 * - `<year>` (4桁)            -> fetchHolidaysByYear
 * - `<year>..<year>`          -> fetchHolidaysBetween('YYYY-01-01', 'YYYY-12-31')
 * - `<from>..<to>` (ISO日付)  -> fetchHolidaysBetween
 * - `--all` (位置引数なし)    -> fetchAllHolidays
 * - 引数なし                  -> fetchHolidaysByYear(currentYearJst)
 *
 * @throws {@link CaoHolidaysError} 形式違反は INVALID_INPUT
 */
async function dispatch(
  positional: string | undefined,
  all: boolean,
  options: FetchOptions,
): Promise<Holiday[]> {
  if (positional === undefined) {
    if (all) return fetchAllHolidays(options)
    return fetchHolidaysByYear(currentYearJst(), options)
  }

  const year = positional.match(/^(\d{4})$/)
  if (year) return fetchHolidaysByYear(Number(year[1]), options)

  const yearRange = positional.match(/^(\d{4})\.\.(\d{4})$/)
  if (yearRange) {
    return fetchHolidaysBetween(`${yearRange[1]}-01-01`, `${yearRange[2]}-12-31`, options)
  }

  const dateRange = positional.match(/^(\d{4}-\d{2}-\d{2})\.\.(\d{4}-\d{2}-\d{2})$/)
  if (dateRange)
    return fetchHolidaysBetween(dateRange[1] as string, dateRange[2] as string, options)

  throw new CaoHolidaysError(
    'INVALID_INPUT',
    `unrecognized argument: '${positional}'. Expected <year>, <year>..<year>, or <from>..<to> (YYYY-MM-DD)`,
  )
}

/** JST における現在の西暦年を number で返す。 */
function currentYearJst(): number {
  const yyyy = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
  }).format(new Date())
  return Number(yyyy)
}

/** `Holiday[]` を指定フォーマットの文字列にする。 */
function serialize(holidays: Holiday[], format: Format): string {
  switch (format) {
    case 'csv':
      return formatCsv(holidays)
    case 'json':
      return formatJson(holidays)
    case 'ics':
      return formatIcs(holidays)
  }
}

/** `--timeout` の値を検証して number にする。NG なら Error を返す（投げない）。 */
function parseTimeout(raw: string | undefined): number | Error {
  if (raw === undefined) return 30_000
  const n = Number(raw)
  if (!Number.isInteger(n) || n < 0) {
    return new Error(`--timeout must be a non-negative integer (ms), got: ${raw}`)
  }
  return n
}

/** `--format` 値の型ガード。 */
function isFormat(v: string): v is Format {
  return (FORMATS as readonly string[]).includes(v)
}

/** 成功結果。 */
function ok(stdout: string): CliResult {
  return { stdout, stderr: '', code: 0 }
}

/** 失敗結果。 */
function fail(code: 1 | 2, message: string): CliResult {
  return { stdout: '', stderr: `${message}\n`, code }
}
