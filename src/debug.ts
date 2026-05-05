import { format } from 'node:util'

/**
 * `DEBUG` 環境変数で名前空間が有効化されているかを判定する。
 *
 * - `DEBUG=cao-holidays` / `DEBUG=*` で `cao-holidays` が有効
 * - 複数指定はカンマ or 空白区切り（例: `DEBUG=foo,cao-holidays`）
 * - 値先頭の `-` で除外（例: `DEBUG=*,-cao-holidays`）
 */
function isEnabled(namespace: string): boolean {
  const raw = process.env.DEBUG
  if (!raw) return false
  const tokens = raw.split(/[\s,]+/).filter(Boolean)
  let enabled = false
  for (const t of tokens) {
    if (t.startsWith('-')) {
      const name = t.slice(1)
      if (name === namespace || name === '*') enabled = false
    } else if (t === namespace || t === '*') {
      enabled = true
    }
  }
  return enabled
}

/**
 * `debug` パッケージ互換の最小ロガーを生成する。zero-dep を保つため
 * `node:util.format` のみを使用。
 *
 * `DEBUG=<namespace>` が指定された時のみ stderr にログを出力する。
 * 出力フォーマット: `<ISO timestamp> <namespace> <message>`
 *
 * @param namespace - 名前空間（例: `cao-holidays`）
 * @returns デバッグログ関数
 */
export function createDebug(namespace: string): (formatStr: string, ...args: unknown[]) => void {
  const enabled = isEnabled(namespace)
  if (!enabled) return () => {}
  return (formatStr, ...args) => {
    const ts = new Date().toISOString()
    process.stderr.write(`${ts} ${namespace} ${format(formatStr, ...args)}\n`)
  }
}
