import pkg from '../package.json' with { type: 'json' }
import { createDebug } from './debug.ts'
import { CaoHolidaysError } from './errors.ts'
import { decodeSjis } from './parse.ts'
import type { FetchOptions } from './types.ts'

/** `DEBUG=cao-holidays` で有効化されるデバッグロガー。 */
const debug = createDebug('cao-holidays')

/** デジタル庁オープンデータカタログ（CKAN）の `package_show` API エンドポイント。 */
export const CKAN_URL = 'https://data.e-gov.go.jp/data/api/action/package_show?id=cao_20190522_0002'

/** 内閣府サーバへのリクエストに付与する User-Agent ヘッダ値。 */
const USER_AGENT = `cao-holidays/${pkg.version}`

/**
 * `FetchOptions` から fetch 実装と共通の `RequestInit` を組み立てる。
 *
 * - `options.fetch` があればそれを使い、無ければグローバルの `fetch`
 * - User-Agent と AbortSignal は全リクエストに自動付与
 */
function makeFetcher(options: FetchOptions = {}) {
  const fetchImpl = options.fetch ?? globalThis.fetch
  const init: RequestInit = {
    headers: { 'User-Agent': USER_AGENT },
    ...(options.signal ? { signal: options.signal } : {}),
  }
  return { fetchImpl, init }
}

/**
 * 例外を `CaoHolidaysError(FETCH_FAILED)` にラップする。
 * 元の例外は `cause` に保持。`AbortError` も含めて FETCH_FAILED に統一。
 */
function wrapFetchError(message: string, cause: unknown): never {
  throw new CaoHolidaysError('FETCH_FAILED', message, { cause })
}

/**
 * CKAN `package_show` API を叩いて CSV の実 URL を解決する。
 *
 * @param options - fetch のキャンセル / DI 用オプション
 * @returns CSV ファイルの URL（`resources[0].url`）
 * @throws {@link CaoHolidaysError} `FETCH_FAILED` (HTTP / ネットワーク) / `PARSE_FAILED` (JSON 解析 / リソース欠落)
 */
export async function resolveCsvUrl(options: FetchOptions = {}): Promise<string> {
  const { fetchImpl, init } = makeFetcher(options)

  debug('resolving CSV URL via CKAN: %s', CKAN_URL)
  let res: Response
  try {
    res = await fetchImpl(CKAN_URL, init)
  } catch (e) {
    wrapFetchError(`failed to fetch CKAN metadata: ${CKAN_URL}`, e)
  }

  if (!res.ok) {
    throw new CaoHolidaysError(
      'FETCH_FAILED',
      `CKAN metadata responded with HTTP ${res.status}: ${CKAN_URL}`,
    )
  }

  let json: unknown
  try {
    json = await res.json()
  } catch (e) {
    throw new CaoHolidaysError('PARSE_FAILED', 'CKAN metadata response is not valid JSON', {
      cause: e,
    })
  }

  const url = extractFirstResourceUrl(json)
  if (!url) {
    throw new CaoHolidaysError('PARSE_FAILED', 'CKAN metadata response has no resources[0].url')
  }
  debug('resolved CSV URL: %s', url)
  return url
}

/**
 * CKAN レスポンス JSON から `result.resources[0].url` を取り出す。
 * 構造が想定外なら `undefined`。
 */
function extractFirstResourceUrl(json: unknown): string | undefined {
  if (typeof json !== 'object' || json === null) return undefined
  const result = (json as { result?: unknown }).result
  if (typeof result !== 'object' || result === null) return undefined
  const resources = (result as { resources?: unknown }).resources
  if (!Array.isArray(resources) || resources.length === 0) return undefined
  const first = resources[0]
  if (typeof first !== 'object' || first === null) return undefined
  const url = (first as { url?: unknown }).url
  return typeof url === 'string' ? url : undefined
}

/**
 * 内閣府の祝日 CSV を取得し、SJIS デコード済みのテキストとして返す。
 *
 * 1. CKAN `package_show` で実 URL を解決
 * 2. その URL から CSV をバイナリ取得
 * 3. `TextDecoder('shift_jis')` でデコード
 *
 * @param options - fetch のキャンセル / DI 用オプション
 * @returns CSV テキスト（UTF-8）
 * @throws {@link CaoHolidaysError} `FETCH_FAILED` / `PARSE_FAILED`
 */
export async function fetchCsvText(options: FetchOptions = {}): Promise<string> {
  const url = await resolveCsvUrl(options)
  const { fetchImpl, init } = makeFetcher(options)

  debug('fetching CSV: %s', url)
  let res: Response
  try {
    res = await fetchImpl(url, init)
  } catch (e) {
    wrapFetchError(`failed to fetch CSV: ${url}`, e)
  }

  if (!res.ok) {
    throw new CaoHolidaysError('FETCH_FAILED', `CSV responded with HTTP ${res.status}: ${url}`)
  }

  const buf = await res.arrayBuffer()
  debug('fetched %d bytes', buf.byteLength)
  return decodeSjis(buf)
}
