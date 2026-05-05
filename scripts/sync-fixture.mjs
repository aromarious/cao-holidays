#!/usr/bin/env node
/**
 * tests/fixtures/syukujitsu.csv を内閣府の最新 CSV に同期する手動スクリプト。
 *
 * - CKAN package_show API で URL を解決 → CSV を fetch
 * - 既存 fixture とバイナリ等価なら何もしない（exit 0、"no changes" 出力）
 * - 差分があれば上書きして bytes / SHA-256 を表示
 * - 失敗（fetch 5xx、CKAN 解析失敗、など）は exit 1
 *
 * 使い方: `pnpm sync-fixture`
 *
 * 設計上、このスクリプトは src/ のライブラリ実装を import せず独立に動く。
 * fixture を src/ より優先したいケース（例: ライブラリ自体が壊れてフィクスチャ更新が
 * できなくなる事故）を避けるため。
 */
import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const CKAN_URL = 'https://data.e-gov.go.jp/data/api/action/package_show?id=cao_20190522_0002'

const FIXTURE_PATH = fileURLToPath(new URL('../tests/fixtures/syukujitsu.csv', import.meta.url))

const PKG = JSON.parse(
  await readFile(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8'),
)
const USER_AGENT = `cao-holidays/${PKG.version} (sync-fixture)`

/**
 * CKAN メタデータから CSV の実 URL を取得する。
 * @returns {Promise<string>}
 */
async function resolveCsvUrl() {
  const res = await fetch(CKAN_URL, { headers: { 'User-Agent': USER_AGENT } })
  if (!res.ok) {
    throw new Error(`CKAN responded with HTTP ${res.status}`)
  }
  const json = await res.json()
  const url = json?.result?.resources?.[0]?.url
  if (typeof url !== 'string') {
    throw new Error('CKAN response has no resources[0].url')
  }
  return url
}

/**
 * 与えられた URL から CSV のバイト列を取得する。
 * @param {string} url
 * @returns {Promise<Buffer>}
 */
async function fetchCsvBytes(url) {
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } })
  if (!res.ok) {
    throw new Error(`CSV responded with HTTP ${res.status}`)
  }
  return Buffer.from(await res.arrayBuffer())
}

/** SHA-256 の hex digest を返す。 */
function sha256(buf) {
  return createHash('sha256').update(buf).digest('hex')
}

async function main() {
  console.error(`fetching CKAN metadata: ${CKAN_URL}`)
  const csvUrl = await resolveCsvUrl()
  console.error(`fetching CSV: ${csvUrl}`)
  const next = await fetchCsvBytes(csvUrl)

  const prev = await readFile(FIXTURE_PATH).catch(() => null)
  if (prev && Buffer.compare(prev, next) === 0) {
    console.log(`no changes (${next.length} bytes, sha256=${sha256(next).slice(0, 12)}...)`)
    return
  }

  await writeFile(FIXTURE_PATH, next)
  console.log(
    `updated: ${FIXTURE_PATH}\n  bytes:  ${prev?.length ?? 0} -> ${next.length}\n  sha256: ${sha256(next)}`,
  )
}

await main().catch((e) => {
  console.error(`sync-fixture failed: ${e.message}`)
  process.exitCode = 1
})
