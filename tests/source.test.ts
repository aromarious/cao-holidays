import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { CaoHolidaysError } from '../src/errors.ts'
import { CKAN_URL, fetchCsvText, resolveCsvUrl } from '../src/source.ts'

const fixturePath = fileURLToPath(new URL('./fixtures/syukujitsu.csv', import.meta.url))

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
  it('points to the official cao_20190522_0002 dataset', () => {
    expect(CKAN_URL).toBe(
      'https://data.e-gov.go.jp/data/api/action/package_show?id=cao_20190522_0002',
    )
  })
})

describe('resolveCsvUrl', () => {
  it('returns resources[0].url from the CKAN response', async () => {
    const { fetch } = makeFakeFetch({
      [CKAN_URL]: () => new Response(JSON.stringify(ckanResponseJson)),
    })
    const url = await resolveCsvUrl({ fetch })
    expect(url).toBe(REAL_CSV_URL)
  })

  it('sends a User-Agent header identifying the package', async () => {
    const { fetch, calls } = makeFakeFetch({
      [CKAN_URL]: () => new Response(JSON.stringify(ckanResponseJson)),
    })
    await resolveCsvUrl({ fetch })
    const headers = new Headers(calls[0]?.init?.headers)
    expect(headers.get('User-Agent')).toMatch(/^cao-holidays\//)
  })

  it('throws FETCH_FAILED on non-2xx HTTP response', async () => {
    const { fetch } = makeFakeFetch({
      [CKAN_URL]: () => new Response('Server Error', { status: 500 }),
    })
    await expect(resolveCsvUrl({ fetch })).rejects.toThrowError(CaoHolidaysError)
    await resolveCsvUrl({ fetch }).catch((e: unknown) => {
      expect(e).toBeInstanceOf(CaoHolidaysError)
      if (e instanceof CaoHolidaysError) expect(e.code).toBe('FETCH_FAILED')
    })
  })

  it('throws PARSE_FAILED on malformed JSON response', async () => {
    const { fetch } = makeFakeFetch({
      [CKAN_URL]: () => new Response('<<not json>>'),
    })
    await resolveCsvUrl({ fetch }).catch((e: unknown) => {
      expect(e).toBeInstanceOf(CaoHolidaysError)
      if (e instanceof CaoHolidaysError) expect(e.code).toBe('PARSE_FAILED')
    })
  })

  it('throws PARSE_FAILED when CKAN response has no resources', async () => {
    const empty = { success: true, result: { resources: [] } }
    const { fetch } = makeFakeFetch({
      [CKAN_URL]: () => new Response(JSON.stringify(empty)),
    })
    await resolveCsvUrl({ fetch }).catch((e: unknown) => {
      expect(e).toBeInstanceOf(CaoHolidaysError)
      if (e instanceof CaoHolidaysError) expect(e.code).toBe('PARSE_FAILED')
    })
  })

  it('wraps AbortSignal aborts as FETCH_FAILED with the original cause', async () => {
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
  it('resolves URL via CKAN, fetches the CSV, and returns SJIS-decoded text', async () => {
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

  it('forwards FetchOptions.signal to both CKAN and CSV requests', async () => {
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

  it('throws FETCH_FAILED when the CSV download returns a non-2xx response', async () => {
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
