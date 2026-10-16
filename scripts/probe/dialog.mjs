// 运行时授权弹窗全闭环：触发 geolocation → 卡片出现 → 倒计时递减 → 拒绝移除 → 重现（拒绝不持久化）→ 拒绝收尾
// 自带前置：复位 lab 权限（清历史持久化决策）+ 激活主窗 + 确保 lab tab 打开；收尾用「拒绝」保持环境干净
import { activateMainWindow, click, connect, ensureLabTab, evalx, pages, report, resetLabPerms, sleep, summary } from './_lib.mjs'

activateMainWindow()
await resetLabPerms()
const lab = await ensureLabTab()

async function overlayDialogState() {
  const { overlays } = await pages()
  for (const t of overlays) {
    const p = await connect(t.webSocketDebuggerUrl)
    const st = await evalx(p, `JSON.stringify({
      card: Boolean(document.querySelector('.ov-dialog__card')),
      text: document.querySelector('.ov-dialog__text')?.textContent?.slice(0, 50) ?? null,
      countdown: document.querySelector('.ov-dialog__count')?.textContent ?? null,
    })`)
    p.ws.close()
    const v = JSON.parse(st.value)
    if (v.card) { return v }
  }
  return null
}

/** 在弹窗窗上点指定按钮：primary = 允许，非 primary = 拒绝 */
async function clickDialogButton(primary) {
  const { overlays } = await pages()
  for (const t of overlays) {
    const p = await connect(t.webSocketDebuggerUrl)
    const has = (await evalx(p, `Boolean(document.querySelector('.ov-dialog__card'))`)).value
    if (has) {
      const ok = await click(p, primary ? '.ov-btn--primary' : '.ov-btn:not(.ov-btn--primary)')
      p.ws.close()
      return ok
    }
    p.ws.close()
  }
  return false
}

// 1. 触发 → 弹窗出现
await click(lab, '[data-op="geolocation"]')
await sleep(1100)
const d1 = await overlayDialogState()
report('弹窗卡片出现', Boolean(d1), d1 ? `text=${d1.text}` : 'NOT FOUND')
report('弹窗内容含地理位置', /地理|定位|geolocation/i.test(String(d1?.text)), String(d1?.text ?? ''))

// 2. 超时倒计时可见递减
await sleep(2300)
const d2 = await overlayDialogState()
const n1 = Number(String(d1?.countdown).match(/\d+/)?.[0])
const n2 = Number(String(d2?.countdown).match(/\d+/)?.[0])
report('超时倒计时可见递减', Number.isFinite(n1) && Number.isFinite(n2) && n2 < n1, `${n1} → ${n2}`)

// 3. 点「拒绝」→ 卡片移除
report('点击「拒绝」按钮', (await clickDialogButton(false)) === true)
await sleep(700)
report('拒绝后卡片移除', !(await overlayDialogState()))

// 4. 再次触发 → 重现（拒绝不持久化）
await click(lab, '[data-op="geolocation"]')
await sleep(1100)
report('拒绝后再次触发弹窗重现（不持久化）', Boolean(await overlayDialogState()))

// 5. 「拒绝」收尾：决策不持久化，保持环境干净（点「允许」会写入持久化影响后续探针）
report('点击「拒绝」收尾', (await clickDialogButton(false)) === true)
await sleep(700)
report('收尾后卡片移除', !(await overlayDialogState()))

lab.ws.close()
summary('probe-dialog')
