// 优雅退出验证：shell 调 window.close() → app 退出（dev 进程结束；三类浮层窗 closed 回调不残留）
import process from 'node:process'
import { connect, pages } from './_lib.mjs'

const { shell } = await pages()
if (!shell) {
  console.log('shell page not found')
  process.exit(1)
}
const p = await connect(shell.webSocketDebuggerUrl)
const r = await p.send('Runtime.evaluate', { expression: 'window.desktop.window.close()', returnByValue: true })
console.log('close invoked:', JSON.stringify(r.result?.result?.value ?? r.result))
setTimeout(() => process.exit(0), 800)
p.ws.close()
