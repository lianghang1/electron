// Tab 右键菜单专项：菜单浮层窗出现 + 4 项文案 + 刷新动作真实重载 + 连续右键 + ESC + 点外关闭
// 页面内容不变灰的核心保障是架构性的（菜单走独立原生浮层窗，视图抑制链路已删除）；
// visibilityState 受 Chromium 遮挡检测影响（见 move-front.mjs 头注释），不作断言对象
import { connect, ensureLabTab, evalx, pages, report, sleep, summary } from './_lib.mjs'

const shellTarget = (await pages()).shell
const shell = await connect(shellTarget.webSocketDebuggerUrl)
const lab = await ensureLabTab()

/** 在 menuWin 页查菜单卡状态 */
async function menuState() {
  const { overlays } = await pages()
  for (const t of overlays) {
    const p = await connect(t.webSocketDebuggerUrl)
    const r = await evalx(p, `JSON.stringify({
      card: Boolean(document.querySelector('.ov-menu__card')),
      items: [...document.querySelectorAll('.ov-menu__item')].map(b => b.textContent.trim()),
    })`)
    p.ws.close()
    const v = JSON.parse(r.value)
    if (v.card)
      return v
  }
  return null
}

/** Shell 顶栏第一个 tab 上合成右键（坐标取按钮位置） */
async function openMenu() {
  await evalx(shell, `(() => {
    const btn = document.querySelector('.dt-tab')
    const r = btn.getBoundingClientRect()
    btn.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.left + 20, clientY: r.top + 10 }))
  })()`)
}

/** 拿到承载菜单卡的浮层页连接 */
async function menuWindow() {
  const { overlays } = await pages()
  for (const t of overlays) {
    const p = await connect(t.webSocketDebuggerUrl)
    if ((await evalx(p, `Boolean(document.querySelector('.ov-menu__card'))`)).value)
      return p
    p.ws.close()
  }
  return null
}

// 基线：页面加载起点（刷新动作后应变化）
const timeOriginBefore = (await evalx(lab, 'String(performance.timeOrigin)')).value

// 1. 菜单浮层窗出现 + 文案
await openMenu()
await sleep(1000)
const m1 = await menuState()
report('菜单浮层窗出现（.ov-menu__card）', Boolean(m1), m1 ? `items=${m1.items.join('/')}` : 'NOT FOUND')
report('菜单项 4 项文案正确', m1 && m1.items.length === 4 && m1.items[2] === '清除站点数据' && m1.items[3] === '关闭标签页', m1 ? m1.items.join('|') : '')

// 2. 选「刷新页面」→ lab 页真实重载 + 菜单关闭
const menuWin = await menuWindow()
await evalx(menuWin, `[...document.querySelectorAll('.ov-menu__item')].find(b => b.textContent.trim() === '刷新页面').click()`)
menuWin.ws.close()
await sleep(2500)
const timeOriginAfter = (await evalx(lab, 'String(performance.timeOrigin)')).value
report('选中「刷新页面」→ lab 页真实重载', timeOriginAfter !== timeOriginBefore, `${timeOriginBefore} -> ${timeOriginAfter}`)
report('选中后菜单关闭', !(await menuState()))

// 3. ESC 关闭闭环（连续右键也能打开）
await openMenu()
await sleep(800)
report('再次打开菜单（连续右键）', Boolean(await menuState()))
const menuWin2 = await menuWindow()
await evalx(menuWin2, `window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`)
await sleep(700)
report('ESC 关闭菜单', !(await menuState()))
menuWin2.ws.close()

// 4. 点击菜单外关闭
await openMenu()
await sleep(800)
const menuWin3 = await menuWindow()
await evalx(menuWin3, `document.querySelector('.ov-menu').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))`)
await sleep(700)
report('点击菜单外关闭', !(await menuState()))
menuWin3.ws.close()

shell.ws.close()
lab.ws.close()
summary('probe-menu')
