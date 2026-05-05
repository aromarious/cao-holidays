/**
 * fetch リトライ層（CLI 専用、ライブラリ API は介在しない）。
 *
 * Issue #13 のポリシー:
 * - 指数バックオフ `baseDelayMs * 2^attempt` + ジッタ ±20%
 * - HTTP 5xx / 408 / 429 / ネットワーク失敗 / AbortError をリトライ対象
 * - HTTP 4xx (上記以外) と PARSE_FAILED / INVALID_INPUT / OUT_OF_RANGE は対象外
 * - 429 は `Retry-After` ヘッダがあれば尊重
 * - `--timeout` は1試行ごとの上限（毎回 fresh な AbortSignal.timeout を作る）
 */

const ALWAYS_RETRIABLE_STATUSES = new Set([408, 429])

/**
 * HTTP ステータスコードがリトライ対象か判定する。
 *
 * 5xx 全般と 408 / 429 を対象とし、その他の 4xx と 2xx / 3xx は対象外。
 *
 * @param status - HTTP ステータスコード
 * @returns リトライ対象なら `true`
 */
export function isRetriableStatus(status: number): boolean {
  if (ALWAYS_RETRIABLE_STATUSES.has(status)) return true
  if (status >= 500 && status < 600) return true
  return false
}

/**
 * 例外がリトライ対象か判定する（ネットワーク到達失敗 / AbortError など）。
 *
 * @param err - キャッチされた例外
 * @returns リトライ対象なら `true`
 */
export function isRetriableError(err: unknown): boolean {
  if (!(err instanceof Error)) return false
  // タイムアウト含む abort
  if (err.name === 'AbortError' || err.name === 'TimeoutError') return true
  // fetch のネットワーク失敗（undici は TypeError("fetch failed")）
  if (err.name === 'TypeError') return true
  // Node.js 固有エラーコード
  const cause = (err as { cause?: { code?: unknown } }).cause
  const code = cause && typeof cause === 'object' ? (cause as { code?: unknown }).code : undefined
  if (typeof code === 'string') {
    if (
      code === 'ECONNREFUSED' ||
      code === 'ECONNRESET' ||
      code === 'ETIMEDOUT' ||
      code === 'EAI_AGAIN' ||
      code === 'ENOTFOUND' ||
      code === 'EPIPE' ||
      code === 'UND_ERR_SOCKET' ||
      code === 'UND_ERR_CONNECT_TIMEOUT'
    ) {
      return true
    }
  }
  return false
}

/**
 * `Retry-After` ヘッダをミリ秒に解釈する。
 *
 * - delta-seconds（例: `120`）
 * - HTTP-date（例: `Wed, 21 Oct 2025 07:28:00 GMT`）
 *
 * @param headers - HTTP レスポンスヘッダ
 * @returns 待機ミリ秒。ヘッダが無い / 解釈失敗なら `undefined`
 */
export function parseRetryAfter(headers: Headers): number | undefined {
  const v = headers.get('retry-after')
  if (!v) return undefined
  const seconds = Number(v)
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000
  const dateMs = Date.parse(v)
  if (!Number.isNaN(dateMs)) return Math.max(0, dateMs - Date.now())
  return undefined
}

/**
 * 指数バックオフ + ±20% ジッタで待機時間を計算する。
 *
 * @param attempt - 0-origin の試行回数（0回目失敗 → 1回目リトライ前）
 * @param baseMs - ベース待機時間
 * @param rng - 乱数源（テストで差し替え可能）
 * @returns ミリ秒
 */
export function backoffDelay(
  attempt: number,
  baseMs: number,
  rng: () => number = Math.random,
): number {
  const exp = baseMs * 2 ** attempt
  // ±20%: 0.8 + 0.4 * [0,1) → [0.8, 1.2)
  const factor = 0.8 + 0.4 * rng()
  return Math.round(exp * factor)
}

/** 指定ミリ秒スリープ（外部シグナルで中断可能）。 */
function sleep(ms: number, externalSignal?: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (externalSignal?.aborted) {
      reject(externalSignal.reason ?? new DOMException('aborted', 'AbortError'))
      return
    }
    const timer = setTimeout(() => {
      externalSignal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      clearTimeout(timer)
      reject(externalSignal?.reason ?? new DOMException('aborted', 'AbortError'))
    }
    externalSignal?.addEventListener('abort', onAbort, { once: true })
  })
}

/** リトライ通知ハンドラに渡される情報。 */
export type RetryInfo = {
  /** 1-origin の次回試行番号（リトライ直前に呼ばれる） */
  attempt: number
  /** 次回試行までの待機ミリ秒 */
  delayMs: number
  /** リトライ理由（HTTP ステータス文字列やエラーメッセージ） */
  reason: string
}

/** `makeRetryingFetch` のオプション。 */
export type RetryOptions = {
  /** 最大リトライ回数（0 で無効化、`n` で最大 `n+1` 回試行） */
  retries: number
  /** ベース待機ミリ秒（指数バックオフの base） */
  baseDelayMs: number
  /** 1試行あたりのタイムアウト（指定すると毎試行で fresh な `AbortSignal.timeout` を作る） */
  perAttemptTimeoutMs?: number
  /** 外部からのキャンセル用シグナル（リトライ間スリープも中断する） */
  externalSignal?: AbortSignal
  /** リトライ直前のコールバック（stderr 出力等に使う） */
  onRetry?: (info: RetryInfo) => void
  /** 乱数源（テストで `Math.random` を差し替えるため） */
  random?: () => number
}

/**
 * リトライロジックで包んだ `fetch` 互換関数を返す。
 *
 * 利用者は通常の `fetch` と同じシグネチャで呼べる。`init.signal` が渡されても、
 * `perAttemptTimeoutMs` が指定されている場合はそちらと AND 結合した signal で
 * 実行される（どちらかが abort すれば fetch も abort）。
 *
 * @param baseFetch - 実際の fetch 実装（`globalThis.fetch` か DI 用 fake）
 * @param options - リトライポリシー
 * @returns リトライ機能付き fetch
 */
export function makeRetryingFetch(baseFetch: typeof fetch, options: RetryOptions): typeof fetch {
  const { retries, baseDelayMs, perAttemptTimeoutMs, externalSignal, onRetry, random } = options
  const rng = random ?? Math.random

  return async (input, init) => {
    let attempt = 0
    while (true) {
      const signals: AbortSignal[] = []
      if (init?.signal) signals.push(init.signal)
      if (externalSignal) signals.push(externalSignal)
      if (perAttemptTimeoutMs !== undefined) signals.push(AbortSignal.timeout(perAttemptTimeoutMs))
      const combined = signals.length > 0 ? AbortSignal.any(signals) : undefined

      try {
        const res = await baseFetch(input, { ...init, ...(combined ? { signal: combined } : {}) })
        if (!res.ok && isRetriableStatus(res.status) && attempt < retries) {
          const retryAfterMs = parseRetryAfter(res.headers)
          const delay = retryAfterMs ?? backoffDelay(attempt, baseDelayMs, rng)
          attempt += 1
          onRetry?.({ attempt, delayMs: delay, reason: `HTTP ${res.status}` })
          await sleep(delay, externalSignal)
          continue
        }
        return res
      } catch (err) {
        if (isRetriableError(err) && attempt < retries) {
          const delay = backoffDelay(attempt, baseDelayMs, rng)
          attempt += 1
          const reason =
            err instanceof Error ? `${err.name}: ${err.message || '(no message)'}` : String(err)
          onRetry?.({ attempt, delayMs: delay, reason })
          await sleep(delay, externalSignal)
          continue
        }
        throw err
      }
    }
  }
}
