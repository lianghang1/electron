/**
 * UI 冒烟截图：通过 CDP 遍历各路由并截屏到指定目录。
 * 用法：先启动 dev（electron-vite dev -- --remote-debugging-port=9222），再
 *   node scripts/capture-funeral.mjs [port] [outDir] [skipNames]
 * skipNames：逗号分隔的跳过路由名（如 electronic-detail，PDF iframe 会触发 CSP 崩溃）
 */
import { Buffer } from 'node:buffer'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const port = process.argv[2] || '9222'
const outDir = path.resolve(process.argv[3] || 'shots')
const skip = new Set((process.argv[4] || '').split(',').filter(Boolean))

const routes = [
  ['home', '/'],
  ['payment', '/payment'],
  ['payment-order', '/payment/order-detail?businessId=BS202609240012&businessType=5'],
  ['payment-pay', '/payment/pay?serialNo=DEMO&businessId=BS202609240012&businessType=5'],
  ['invoice', '/invoice'],
  ['invoice-order', '/invoice/order-detail?businessId=BS202609250004&businessType=5'],
  ['electronic', '/electronic'],
  ['electronic-detail', '/electronic/detail?businessId=BS202609240012&businessType=5'],
  ['retail', '/retail'],
  ['hall', '/hall'],
  ['cremation', '/cremation'],
  ['activity', '/activity'],
  ['faq', '/faq'],
  ['policy', '/policy'],
]

const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
const page = targets.find(t => t.type === 'page' && !/devtools/i.test(t.url))
if (!page) {
  console.error('未找到页面 target：', targets.map(t => `${t.type}:${t.url}`).join('\n'))
  process.exit(1)
}

const ws = new WebSocket(page.webSocketDebuggerUrl)
let msgId = 0
const pending = new Map()

function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++msgId
    pending.set(id, { resolve, reject })
    ws.send(JSON.stringify({ id, method, params }))
  })
}

ws.onmessage = (event) => {
  const msg = JSON.parse(event.data)
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id)
    pending.delete(msg.id)
    if (msg.error)
      reject(new Error(JSON.stringify(msg.error)))
    else
      resolve(msg.result)
  }
}

await new Promise((resolve, reject) => {
  ws.onopen = resolve
  ws.onerror = reject
})

// 窗口隐藏时 rAF 不触发，Vue 过渡会冻结导致 RouterView 空白——截图前必须把窗口带到前台并整体重载
await send('Page.enable')
await send('Page.bringToFront')
await send('Page.reload')
// dev 冷 reload 需重新 transform 全量模块，等久一点再开始导航
await new Promise(r => setTimeout(r, 5000))

mkdirSync(outDir, { recursive: true })
for (const [name, route] of routes) {
  if (skip.has(name))
    continue
  await send('Runtime.evaluate', { expression: `location.hash = '${route}'` })
  await new Promise(r => setTimeout(r, 1400))
  const { data } = await send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(path.join(outDir, `${name}.png`), Buffer.from(data, 'base64'))
  console.log('captured', name)
}

// 附加：payment 证件查询 Tab（需点击切换，验收 FhQueryPanel 输入布局）
if (!skip.has('payment-idcard')) {
  await send('Runtime.evaluate', { expression: `location.hash = '/payment'` })
  await new Promise(r => setTimeout(r, 1400))
  await send('Runtime.evaluate', { expression: `document.querySelectorAll('.fh-qp__tab')[1].click()` })
  await new Promise(r => setTimeout(r, 600))
  const shot = await send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(path.join(outDir, 'payment-idcard.png'), Buffer.from(shot.data, 'base64'))
  console.log('captured payment-idcard')
}
ws.close()
process.exit(0)
