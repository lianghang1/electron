// CDP 探针共享库：连接 / 求值 / 断言计数 / 前置动作（激活主窗、打开 lab、权限复位）
// 依赖根 devDep ws —— Node 20 的全局 WebSocket 仍需 --experimental-websocket 旗标，直接用 ws 免旗标
import { execSync } from 'node:child_process'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

export const CDP = 'http://127.0.0.1:9222'
export const sleep = ms => new Promise(r => setTimeout(r, ms))

const dir = path.dirname(fileURLToPath(import.meta.url))

let passCount = 0
let failCount = 0

/** 单条断言：PASS/FAIL + 明细，累计计数 */
export function report(name, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'} | ${name}${detail ? ` | ${detail}` : ''}`)
  ok ? passCount++ : failCount++
}

/** 收尾：打印汇总，退出码 = 失败数（0 = 全过，可接 CI） */
export function summary(title) {
  console.log(`\n===== ${title} SUMMARY ===== pass=${passCount} fail=${failCount}`)
  process.exit(failCount ? 1 : 0)
}

export async function connect(wsUrl) {
  const { default: WebSocket } = await import('ws')
  const ws = new WebSocket(wsUrl)
  await new Promise((res, rej) => {
    ws.on('open', res)
    ws.on('error', rej)
  })
  let seq = 0
  return { ws, send: (method, params) => new Promise((res) => {
    const id = ++seq
    const onMsg = (raw) => {
      const m = JSON.parse(raw)
      if (m.id === id) {
        ws.off('message', onMsg)
        res(m)
      }
    }
    ws.on('message', onMsg)
    ws.send(JSON.stringify({ id, method, params: params ?? {} }))
  }) }
}

/** 求值：userGesture 合成用户手势（部分 API 需要弹窗许可） */
export function evalx(p, expression) {
  return p.send('Runtime.evaluate', { expression, returnByValue: true, userGesture: true })
    .then(r => ({ ok: true, value: r.result?.result?.value }))
}

export function click(p, selector) {
  return evalx(p, `(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return false; el.click(); return true })()`).then(r => r.value)
}

/** 目标页分类：shell = Shell renderer，lab = 平台实验室，overlays = 三类浮层窗 */
export async function pages() {
  const ts = await (await fetch(`${CDP}/json`)).json()
  return {
    shell: ts.find(t => t.type === 'page' && t.url.includes('localhost:5173') && !t.url.includes('#/overlay')),
    lab: ts.find(t => t.type === 'page' && t.url.includes('app://lab')),
    overlays: ts.filter(t => t.type === 'page' && t.url.includes('#/overlay')),
  }
}

/** 轮询等待 shell 目标出现（dev 刚启动时用，免固定 sleep） */
export async function waitForShell(timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const { shell } = await pages()
    if (shell)
      return shell
    await sleep(500)
  }
  throw new Error('shell page not found（dev 未启动或 CDP 未开）')
}

/** 前置：确保 lab tab 已打开（lab 页是探针的触发/断言载体），返回 lab 页连接 */
export async function ensureLabTab() {
  const { lab } = await pages()
  if (lab)
    return connect(lab.webSocketDebuggerUrl)
  const shell = await waitForShell()
  const p = await connect(shell.webSocketDebuggerUrl)
  await evalx(p, 'window.desktop.tabs.open({ appId: \'lab\' })')
  p.ws.close()
  await sleep(2500)
  const { lab: labPage } = await pages()
  if (!labPage)
    throw new Error('lab page not found（lab tab 打开失败）')
  return connect(labPage.webSocketDebuggerUrl)
}

/** 前置：复位 lab 全部运行时权限决策 —— 历史「允许」会被持久化导致弹窗不再出现（测试副作用） */
export async function resetLabPerms() {
  const shell = await waitForShell()
  const p = await connect(shell.webSocketDebuggerUrl)
  await evalx(p, 'window.desktop.permission.reset(\'lab\')')
  p.ws.close()
}

/** 前置：激活主窗（最小化→还原），避免窗口被遮挡影响断言 */
export function activateMainWindow() {
  execSync(`powershell -ExecutionPolicy Bypass -File "${path.join(dir, 'activate-window.ps1')}"`, { stdio: 'inherit' })
}
