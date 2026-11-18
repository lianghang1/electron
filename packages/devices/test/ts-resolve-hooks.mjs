import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

// node --experimental-strip-types 的 ESM 解析不认无扩展名相对导入（源码按 bundler 惯例省略扩展名），
// 此 hook 供测试运行时兜底补 .ts / index.ts，与 electron-vite 的解析行为保持一致。
export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context)
  }
  catch (error) {
    if (!specifier.startsWith('.')) {
      throw error
    }
    // .html 资源导入（bundler ?raw 语义，可能带查询串）：Node 解析器直接拒绝，拼接 URL 交给 load hook
    if (specifier.split('?')[0].endsWith('.html')) {
      return { url: new URL(specifier, context.parentURL).href, shortCircuit: true }
    }
    for (const candidate of [`${specifier}.ts`, `${specifier}/index.ts`]) {
      try {
        return await nextResolve(candidate, context)
      }
      catch {
        // 换下一个候选
      }
    }
    throw error
  }
}

// bundler 把 .html（?raw）导入为字符串；Node 无此加载器，读文件内容作 default 导出。
// electron 主进程 API 在纯 Node 测试环境不可用，替换为按需具名 stub（用到新导出时在此追加）。
const ELECTRON_STUB = [
  'export default {}',
  'export const app = {}',
  'export const net = {}',
  'export const utilityProcess = {}',
].join('\n')

export async function load(url, context, nextLoad) {
  const bare = url.split('?')[0]
  if (bare.endsWith('.html')) {
    const source = await readFile(fileURLToPath(bare), 'utf8')
    return { format: 'module', source: `export default ${JSON.stringify(source)}`, shortCircuit: true }
  }
  if (bare.includes('/node_modules/electron/')) {
    return { format: 'module', source: ELECTRON_STUB, shortCircuit: true }
  }
  return nextLoad(url, context)
}
