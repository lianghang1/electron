/**
 * 白屏诊断：连接 CDP，导航到指定路由，收集运行时异常并检查 DOM。
 * 用法：node --experimental-websocket scripts/diagnose-funeral.mjs <hash> [port]
 */

import process from 'node:process'

const hash = process.argv[2] || '/payment/order-detail?businessId=BS202609240012&businessType=5'
const port = process.argv[3] || '9222'

const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
const page = targets.find(t => t.type === 'page' && !/devtools/i.test(t.url))
const ws = new WebSocket(page.webSocketDebuggerUrl)

let msgId = 0
const pending = new Map()
const exceptions = []
const consoleLogs = []

function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++msgId
    pending.set(id, { resolve, reject })
    ws.send(JSON.stringify({ id, method, params }))
  })
}

ws.onmessage = (event) => {
  const msg = JSON.parse(event.data)
  if (msg.method === 'Runtime.exceptionThrown') {
    const detail = msg.params.exceptionDetails
    exceptions.push(detail.exception?.description || detail.text)
  }
  if (msg.method === 'Runtime.consoleAPICalled') {
    const text = msg.params.args.map(a => a.value ?? a.description ?? '').join(' ')
    consoleLogs.push(`[${msg.params.type}] ${text}`)
  }
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

await send('Runtime.enable')
await send('Runtime.evaluate', { expression: `location.hash = '${hash}'` })
await new Promise(r => setTimeout(r, 3500))

const check = await send('Runtime.evaluate', {
  expression: `JSON.stringify({
    hash: location.hash,
    pageEl: !!document.querySelector('.fh-page'),
    contentEl: !!document.querySelector('.fh-page-content'),
    orderEl: !!document.querySelector('.fp-order'),
    bodyChildren: document.body.children.length,
    appHtmlLen: document.querySelector('#app')?.innerHTML.length,
    appHtmlHead: document.querySelector('#app')?.innerHTML.slice(0, 400),
  })`,
  returnByValue: true,
})
console.log('=== DOM ===')
console.log(check.result.value)
console.log('=== exceptions ===')
console.log(exceptions.join('\n---\n') || '(none)')
console.log('=== console ===')
console.log(consoleLogs.slice(-20).join('\n') || '(none)')
ws.close()
process.exit(0)
