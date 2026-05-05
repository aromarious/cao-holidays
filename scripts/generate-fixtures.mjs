#!/usr/bin/env node
/**
 * fixtures/{all,2026,2025-2027,range-2026-04-01_2026-05-31}.{json,csv,ics} を、
 * fixtures/syukujitsu.csv を入力として packages/js の CLI (run関数) で生成する。
 *
 * 用途: 言語横断の振る舞いを担保するための「期待出力」スナップショット。
 * 各言語実装（JS / Python / Go / ...）はこの fixture と一致する文字列を返さなければならない。
 *
 * 前提: `cd packages/js && pnpm install` 済み（tsx が必要）
 * 使い方: `cd packages/js && node --import tsx ../../scripts/generate-fixtures.mjs`
 *  または: `make generate-fixtures`
 *
 * 内部的には CLI の run() 関数を fake fetch 付きで呼んでおり、利用者が CLI で得る出力と完全に一致する。
 */
import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { run } from '../packages/js/src/cli.ts'
import { CKAN_URL } from '../packages/js/src/source.ts'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const FIXTURE_CSV = `${ROOT}fixtures/syukujitsu.csv`
const FIXTURES_DIR = `${ROOT}fixtures`
const CSV_URL = 'https://www8.cao.go.jp/chosei/shukujitsu/syukujitsu.csv'

const csvBytes = await readFile(FIXTURE_CSV)
const ckanJson = {
  success: true,
  result: { resources: [{ name: 'syukujitsu.csv', url: CSV_URL }] },
}

/**
 * fixtures/syukujitsu.csv を fetch 経由のリクエストにそのまま返す fake fetch。
 * @returns {typeof globalThis.fetch}
 */
function makeFetch() {
  return async (input) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    if (url === CKAN_URL) return new Response(JSON.stringify(ckanJson))
    if (url === CSV_URL) return new Response(csvBytes)
    throw new Error(`unexpected url: ${url}`)
  }
}

const cases = [
  { out: 'all.json', args: ['--all', '--format', 'json'] },
  { out: '2026.json', args: ['2026', '--format', 'json'] },
  { out: '2025-2027.json', args: ['2025..2027', '--format', 'json'] },
  {
    out: 'range-2026-04-01_2026-05-31.json',
    args: ['2026-04-01..2026-05-31', '--format', 'json'],
  },
  { out: '2026.csv', args: ['2026', '--format', 'csv'] },
  { out: '2026.ics', args: ['2026', '--format', 'ics'] },
]

for (const { out, args } of cases) {
  const fetch = makeFetch()
  const r = await run(args, { fetch })
  if (r.code !== 0) {
    console.error(`run(${args.join(' ')}) failed (code=${r.code}): ${r.stderr}`)
    process.exit(1)
  }
  await writeFile(`${FIXTURES_DIR}/${out}`, r.stdout)
  console.log(`wrote fixtures/${out} (${r.stdout.length} bytes)`)
}
