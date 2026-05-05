/**
 * `src/source.ts` のユニットテスト。
 * CKAN package_show API から CSV URL を解決する `resolveCsvUrl` と、解決済み URL から SJIS デコード済み CSV テキストを得る `fetchCsvText` を、
 * fake fetch を使って HTTP・パース・User-Agent・signal 伝播の各ケースを検証する。
 */
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { CaoHolidaysError } from '../src/errors.ts'
import { CKAN_URL, fetchCsvText, resolveCsvUrl } from '../src/source.ts'

const fixturePath = fileURLToPath(new URL('../../../fixtures/syukujitsu.csv', import.meta.url))

const REAL_CSV_URL = 'https://www8.cao.go.jp/chosei/shukujitsu/syukujitsu.csv'

/** CKAN package_show のレスポンスを最低限再現したモック JSON。 */
const ckanResponseJson = {
  success: true,
  result: {
    resources: [
      {
        name: '昭和30年（1955年）から令和2年（2020年）国民の祝日等',
        url: REAL_CSV_URL,
      },
    ],
  },
}

/**
 * 関数として呼ばれるたびに記録 + 引数に応じた Response を返すフェイク fetch。
 * 第一引数（URL）に応じて分岐。
 */
function makeFakeFetch(handlers: Record<string, () => Response | Promise<Response>>) {
  const calls: { url: string; init?: RequestInit }[] = []
  const impl: typeof fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    calls.push({ url, init })
    const handler = handlers[url]
    if (!handler) throw new Error(`unexpected fetch URL: ${url}`)
    return handler()
  }
  return { fetch: impl, calls }
}

describe('CKAN_URL', () => {
  it('公式 cao_20190522_0002 データセットを指している', () => {
    expect(CKAN_URL).toBe(
      'https://data.e-gov.go.jp/data/api/action/package_show?id=cao_20190522_0002',
    )
  })
})

describe('resolveCsvUrl', () => {
  it('CKAN レスポンスから resources[0].url を返す', async () => {
    const { fetch } = makeFakeFetch({
      [CKAN_URL]: () => new Response(JSON.stringify(ckanResponseJson)),
    })
    const url = await resolveCsvUrl({ fetch })
    expect(url).toBe(REAL_CSV_URL)
  })

  it('パッケージを識別する User-Agent ヘッダを付与する', async () => {
    const { fetch, calls } = makeFakeFetch({
      [CKAN_URL]: () => new Response(JSON.stringify(ckanResponseJson)),
    })
    await resolveCsvUrl({ fetch })
    const headers = new Headers(calls[0]?.init?.headers)
    expect(headers.get('User-Agent')).toMatch(/^cao-holidays\//)
  })

  it('HTTP 非 2xx 応答で FETCH_FAILED を投げる', async () => {
    const { fetch } = makeFakeFetch({
      [CKAN_URL]: () => new Response('Server Error', { status: 500 }),
    })
    await expect(resolveCsvUrl({ fetch })).rejects.toThrowError(CaoHolidaysError)
    await resolveCsvUrl({ fetch }).catch((e: unknown) => {
      expect(e).toBeInstanceOf(CaoHolidaysError)
      if (e instanceof CaoHolidaysError) expect(e.code).toBe('FETCH_FAILED')
    })
  })

  it('JSON が壊れているレスポンスで PARSE_FAILED を投げる', async () => {
    const { fetch } = makeFakeFetch({
      [CKAN_URL]: () => new Response('<<not json>>'),
    })
    await resolveCsvUrl({ fetch }).catch((e: unknown) => {
      expect(e).toBeInstanceOf(CaoHolidaysError)
      if (e instanceof CaoHolidaysError) expect(e.code).toBe('PARSE_FAILED')
    })
  })

  it('CKAN レスポンスに resources が無いとき PARSE_FAILED を投げる', async () => {
    const empty = { success: true, result: { resources: [] } }
    const { fetch } = makeFakeFetch({
      [CKAN_URL]: () => new Response(JSON.stringify(empty)),
    })
    await resolveCsvUrl({ fetch }).catch((e: unknown) => {
      expect(e).toBeInstanceOf(CaoHolidaysError)
      if (e instanceof CaoHolidaysError) expect(e.code).toBe('PARSE_FAILED')
    })
  })

  it('AbortSignal による中断を FETCH_FAILED にラップし元の例外を cause に保持する', async () => {
    const ac = new AbortController()
    ac.abort(new DOMException('test', 'AbortError'))
    const { fetch } = makeFakeFetch({
      [CKAN_URL]: () => {
        throw ac.signal.reason
      },
    })
    await resolveCsvUrl({ fetch, signal: ac.signal }).catch((e: unknown) => {
      expect(e).toBeInstanceOf(CaoHolidaysError)
      if (e instanceof CaoHolidaysError) {
        expect(e.code).toBe('FETCH_FAILED')
        expect(e.cause).toBeInstanceOf(DOMException)
      }
    })
  })
})

describe('fetchCsvText', () => {
  it('CKAN で URL 解決 → CSV 取得 → SJIS デコード済みテキストを返す', async () => {
    const csvBuf = await readFile(fixturePath)
    const { fetch } = makeFakeFetch({
      [CKAN_URL]: () => new Response(JSON.stringify(ckanResponseJson)),
      [REAL_CSV_URL]: () => new Response(csvBuf, { headers: { 'content-type': 'text/csv' } }),
    })
    const text = await fetchCsvText({ fetch })
    expect(text.startsWith('国民の祝日・休日月日,国民の祝日・休日名称')).toBe(true)
    expect(text).toContain('1955/1/1,元日')
    expect(text).toContain('2027/11/23,勤労感謝の日')
  })

  it('FetchOptions.signal を CKAN と CSV 両方のリクエストに伝播する', async () => {
    const csvBuf = await readFile(fixturePath)
    const ac = new AbortController()
    const { fetch, calls } = makeFakeFetch({
      [CKAN_URL]: () => new Response(JSON.stringify(ckanResponseJson)),
      [REAL_CSV_URL]: () => new Response(csvBuf),
    })
    await fetchCsvText({ fetch, signal: ac.signal })
    expect(calls.length).toBe(2)
    for (const c of calls) {
      expect(c.init?.signal).toBe(ac.signal)
    }
  })

  it('CSV ダウンロードが非 2xx を返すと FETCH_FAILED を投げる', async () => {
    const { fetch } = makeFakeFetch({
      [CKAN_URL]: () => new Response(JSON.stringify(ckanResponseJson)),
      [REAL_CSV_URL]: () => new Response('Not Found', { status: 404 }),
    })
    await fetchCsvText({ fetch }).catch((e: unknown) => {
      expect(e).toBeInstanceOf(CaoHolidaysError)
      if (e instanceof CaoHolidaysError) expect(e.code).toBe('FETCH_FAILED')
    })
  })
})
