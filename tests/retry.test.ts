/**
 * `src/retry.ts` のユニットテスト。
 * リトライ判定 (`isRetriableStatus` / `isRetriableError`)、`Retry-After` ヘッダのパース、
 * 指数バックオフ + ジッタ (`backoffDelay`)、および `makeRetryingFetch` でラップした fetch のリトライ動作（成功・予算超過・非リトライ・Retry-After 優先）を検証する。
 */
import { describe, expect, it, vi } from 'vitest'
import {
  backoffDelay,
  isRetriableError,
  isRetriableStatus,
  makeRetryingFetch,
  parseRetryAfter,
} from '../src/retry.ts'

describe('isRetriableStatus', () => {
  it('5xx は true', () => {
    for (const s of [500, 502, 503, 504, 599]) {
      expect(isRetriableStatus(s)).toBe(true)
    }
  })

  it('408 / 429 は true', () => {
    expect(isRetriableStatus(408)).toBe(true)
    expect(isRetriableStatus(429)).toBe(true)
  })

  it('それ以外の 4xx は false', () => {
    for (const s of [400, 401, 403, 404, 410, 422]) {
      expect(isRetriableStatus(s)).toBe(false)
    }
  })

  it('2xx / 3xx は false', () => {
    for (const s of [200, 201, 204, 301, 302, 304]) {
      expect(isRetriableStatus(s)).toBe(false)
    }
  })
})

describe('isRetriableError', () => {
  it('AbortError / TimeoutError は true', () => {
    expect(isRetriableError(new DOMException('aborted', 'AbortError'))).toBe(true)
    expect(isRetriableError(new DOMException('timed out', 'TimeoutError'))).toBe(true)
  })

  it('TypeError (fetch のネットワーク失敗) は true', () => {
    expect(isRetriableError(new TypeError('fetch failed'))).toBe(true)
  })

  it('Node 形式の cause.code が既知リストにあれば true', () => {
    const err = new Error('connect refused')
    ;(err as { cause?: unknown }).cause = { code: 'ECONNREFUSED' }
    expect(isRetriableError(err)).toBe(true)
  })

  it('無関係なエラーは false', () => {
    expect(isRetriableError(new RangeError('out of range'))).toBe(false)
    expect(isRetriableError(new SyntaxError('bad json'))).toBe(false)
    expect(isRetriableError('not an error object')).toBe(false)
    expect(isRetriableError(null)).toBe(false)
  })
})

describe('parseRetryAfter', () => {
  it('delta-seconds をパースする', () => {
    const h = new Headers({ 'retry-after': '120' })
    expect(parseRetryAfter(h)).toBe(120_000)
  })

  it('HTTP-date をパースする', () => {
    const future = new Date(Date.now() + 5_000).toUTCString()
    const h = new Headers({ 'retry-after': future })
    const ms = parseRetryAfter(h)
    expect(ms).toBeGreaterThanOrEqual(0)
    // 0–5500ms windowで丸め誤差を許容
    expect(ms).toBeLessThanOrEqual(5_500)
  })

  it('ヘッダ欠如時は undefined', () => {
    expect(parseRetryAfter(new Headers())).toBeUndefined()
  })

  it('不正値は undefined', () => {
    expect(parseRetryAfter(new Headers({ 'retry-after': 'not-a-date' }))).toBeUndefined()
  })

  it('過去の HTTP-date は 0 にクランプする', () => {
    const past = new Date(Date.now() - 60_000).toUTCString()
    expect(parseRetryAfter(new Headers({ 'retry-after': past }))).toBe(0)
  })
})

describe('backoffDelay', () => {
  it('rng=0.5 のときジッタ無しで指数バックオフ (base * 2^attempt) を適用する', () => {
    // factor = 0.8 + 0.4*0.5 = 1.0 → そのまま
    expect(backoffDelay(0, 100, () => 0.5)).toBe(100)
    expect(backoffDelay(1, 100, () => 0.5)).toBe(200)
    expect(backoffDelay(2, 100, () => 0.5)).toBe(400)
    expect(backoffDelay(3, 100, () => 0.5)).toBe(800)
  })

  it('ジッタ係数を [0.8, 1.2) にクランプする', () => {
    expect(backoffDelay(0, 1000, () => 0)).toBe(800) // 1000 * 0.8
    expect(backoffDelay(0, 1000, () => 0.999_999)).toBe(1200) // 1000 * 1.2 に漸近
  })
})

describe('makeRetryingFetch', () => {
  /** N 回失敗してから成功する fake fetch を作る。 */
  function makeFlakyFetch(failures: Array<Response | Error>, success: Response) {
    let i = 0
    const calls: { url: string }[] = []
    const fetch: typeof globalThis.fetch = async (input) => {
      const url =
        typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      calls.push({ url })
      const slot = failures[i++]
      if (slot === undefined) return success.clone()
      if (slot instanceof Error) throw slot
      return slot.clone()
    }
    return { fetch, calls }
  }

  it('初回成功時はそのまま返し onRetry を呼ばない', async () => {
    const { fetch, calls } = makeFlakyFetch([], new Response('ok', { status: 200 }))
    const onRetry = vi.fn()
    const wrapped = makeRetryingFetch(fetch, { retries: 2, baseDelayMs: 1, onRetry })
    const res = await wrapped('https://example.com')
    expect(res.status).toBe(200)
    expect(calls.length).toBe(1)
    expect(onRetry).not.toHaveBeenCalled()
  })

  it('5xx でリトライし予算内で成功する', async () => {
    const { fetch, calls } = makeFlakyFetch(
      [new Response('boom', { status: 503 })],
      new Response('ok', { status: 200 }),
    )
    const onRetry = vi.fn()
    const wrapped = makeRetryingFetch(fetch, {
      retries: 2,
      baseDelayMs: 1,
      onRetry,
      random: () => 0.5,
    })
    const res = await wrapped('https://example.com')
    expect(res.status).toBe(200)
    expect(calls.length).toBe(2)
    expect(onRetry).toHaveBeenCalledExactlyOnceWith({
      attempt: 1,
      delayMs: 1,
      reason: 'HTTP 503',
    })
  })

  it('永続的 5xx ではリトライを使い切り最後のレスポンスを返す', async () => {
    const { fetch, calls } = makeFlakyFetch(
      [new Response('a', { status: 500 }), new Response('b', { status: 500 })],
      new Response('c', { status: 500 }),
    )
    const wrapped = makeRetryingFetch(fetch, { retries: 2, baseDelayMs: 1, random: () => 0.5 })
    const res = await wrapped('https://example.com')
    // retries=2 → 1+2=3 試行、最後は success-position の 500
    expect(res.status).toBe(500)
    expect(calls.length).toBe(3)
  })

  it('408 / 429 以外の 4xx ではリトライしない', async () => {
    const { fetch, calls } = makeFlakyFetch([], new Response('not found', { status: 404 }))
    const onRetry = vi.fn()
    const wrapped = makeRetryingFetch(fetch, { retries: 5, baseDelayMs: 1, onRetry })
    const res = await wrapped('https://example.com')
    expect(res.status).toBe(404)
    expect(calls.length).toBe(1)
    expect(onRetry).not.toHaveBeenCalled()
  })

  it('retries=0 ならリトライしない', async () => {
    const { fetch, calls } = makeFlakyFetch([], new Response('boom', { status: 503 }))
    const onRetry = vi.fn()
    const wrapped = makeRetryingFetch(fetch, { retries: 0, baseDelayMs: 1, onRetry })
    const res = await wrapped('https://example.com')
    expect(res.status).toBe(503)
    expect(calls.length).toBe(1)
    expect(onRetry).not.toHaveBeenCalled()
  })

  it('バックオフより Retry-After (delta-seconds) を優先する', async () => {
    const fail429 = new Response('too many', {
      status: 429,
      headers: { 'retry-after': '0' },
    })
    const { fetch, calls } = makeFlakyFetch([fail429], new Response('ok', { status: 200 }))
    const onRetry = vi.fn()
    const wrapped = makeRetryingFetch(fetch, {
      retries: 1,
      baseDelayMs: 999_999, // 使われたら遅すぎる。Retry-After が勝つはず
      onRetry,
    })
    const res = await wrapped('https://example.com')
    expect(res.status).toBe(200)
    expect(calls.length).toBe(2)
    expect(onRetry).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ attempt: 1, delayMs: 0 }),
    )
  })

  it('リトライ可能エラー (TypeError) でリトライして成功する', async () => {
    const { fetch, calls } = makeFlakyFetch(
      [new TypeError('fetch failed')],
      new Response('ok', { status: 200 }),
    )
    const onRetry = vi.fn()
    const wrapped = makeRetryingFetch(fetch, { retries: 2, baseDelayMs: 1, onRetry })
    const res = await wrapped('https://example.com')
    expect(res.status).toBe(200)
    expect(calls.length).toBe(2)
    expect(onRetry).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ attempt: 1, reason: expect.stringContaining('TypeError') }),
    )
  })

  it('リトライ不可エラーは即座に再 throw する', async () => {
    const fatal = new RangeError('nope')
    const fetch: typeof globalThis.fetch = async () => {
      throw fatal
    }
    const wrapped = makeRetryingFetch(fetch, { retries: 5, baseDelayMs: 1 })
    await expect(wrapped('https://example.com')).rejects.toBe(fatal)
  })
})
