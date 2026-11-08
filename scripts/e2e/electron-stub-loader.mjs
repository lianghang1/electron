// 纯 Node 下替换 electron 模块：e2e 只跑更新通道的落盘/网络逻辑，不启动 Electron。
// 用 data: URL 内联，避免为测试再引入一个源文件。
const stub = `
import { join } from 'node:path'
export const app = {
  getPath: (name) => join(process.env.E2E_USER_DATA, name),
  getVersion: () => '2.0.0-alpha.0',
}
export default app
`

export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'electron') {
    return { url: `data:text/javascript,${encodeURIComponent(stub)}`, shortCircuit: true }
  }
  return nextResolve(specifier, context)
}
