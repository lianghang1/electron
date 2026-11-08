import type { Plugin } from 'tsdown'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import process from 'node:process'
import { defineConfig } from 'tsdown'

/**
 * rolldown 不认 Vite 的 ?raw 后缀：命中即按文本读入（打印模板 HTML 内联进产物）。
 * resolveId 必须把相对路径锚到 importer 所在目录，load 才拿得到绝对路径。
 */
const viteRawCompat: Plugin = {
  name: 'vite-raw-compat',
  resolveId(id, importer) {
    if (!id.endsWith('?raw')) { return null }
    const file = resolve(dirname(importer ?? process.cwd()), id.slice(0, -4))
    return `${file}?raw`
  },
  load(id) {
    if (!id.endsWith('?raw')) { return null }
    return `export default ${JSON.stringify(readFileSync(id.slice(0, -4), 'utf8'))}`
  },
}

export default defineConfig({
  entry: { index: 'src/index.ts' },
  dts: { resolver: 'tsc' },
  format: 'esm',
  external: ['electron'],
  fixedExtension: false,
  plugins: [viteRawCompat],
})
