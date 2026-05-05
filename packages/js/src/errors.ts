/**
 * `CaoHolidaysError` が示すエラー種別。
 *
 * - `INVALID_INPUT`: 引数の型や形式が不正（例: `year` が NaN、`from > to`、`YYYY-MM-DD` 違反）
 * - `OUT_OF_RANGE`: 引数自体は正しいが、CSV の収録範囲外（該当年の祝日が存在しない）
 * - `FETCH_FAILED`: ネットワーク取得失敗、AbortSignal による中断、HTTP エラー応答など
 * - `PARSE_FAILED`: CSV のデコード・パース失敗
 */
export type CaoHolidaysErrorCode =
  | 'INVALID_INPUT'
  | 'OUT_OF_RANGE'
  | 'FETCH_FAILED'
  | 'PARSE_FAILED'

/**
 * cao-holidays が投げる唯一の例外クラス。
 *
 * 利用者は `instanceof CaoHolidaysError` で判別し、`code` で原因を分岐できる。
 * 元の例外がある場合は `cause` プロパティに保持される（ES2022 の `Error.cause`）。
 *
 * @example
 * ```ts
 * try {
 *   await fetchHolidaysByYear(2026);
 * } catch (e) {
 *   if (e instanceof CaoHolidaysError && e.code === 'FETCH_FAILED') {
 *     console.error('network error', e.cause);
 *   }
 * }
 * ```
 */
export class CaoHolidaysError extends Error {
  /** エラー種別。 */
  readonly code: CaoHolidaysErrorCode

  /**
   * @param code - エラー種別
   * @param message - 人間可読のエラーメッセージ
   * @param options - `cause` に元の例外を渡せる
   */
  constructor(code: CaoHolidaysErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'CaoHolidaysError'
    this.code = code
  }
}
