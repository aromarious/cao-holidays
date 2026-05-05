/** 内閣府CSVから取得した祝日エントリ。日付は JST の YYYY-MM-DD に正規化済み。 */
export type Holiday = {
  /** ISO 8601 拡張形式 'YYYY-MM-DD' (JST) */
  date: string
  /** 内閣府の名称をそのまま (例: '元日') */
  name: string
}

/** fetch 系関数の共通オプション。 */
export type FetchOptions = {
  /** fetch のキャンセル用 AbortSignal。abort 時は CaoHolidaysError(FETCH_FAILED) にラップされる。 */
  signal?: AbortSignal
  /** DI 用の fetch 実装。テスト・プロキシ・CORS 回避などで差し替え可能。 */
  fetch?: typeof fetch
}
