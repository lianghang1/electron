// 下载通知卡专项：逐条卡片 + 进度态 + 状态流转 + × 关闭回传 + 终态 TTL 自动消失
// 进度捕捉为确定性方案：app://lab/slow-download 同源直链（Main 侧流式限速 ≈10MB/s + Content-Disposition），
// 平台下载域按流节奏推进，progressing 态持续数秒——blob 下载写盘过快（NVMe <1s）无法稳定捕捉
import process from 'node:process'
import { click, connect, ensureLabTab, evalx, pages, report, sleep, summary } from './_lib.mjs'

const lab = await ensureLabTab()

/** 找到 panel 浮层页（承载下载/通知卡的 overlay 页：存在 .ov-panel 的那个） */
async function findPanelPage() {
  const { overlays } = await pages()
  for (const t of overlays) {
    const p = await connect(t.webSocketDebuggerUrl)
    const has = await evalx(p, `JSON.stringify({
      dl: document.querySelectorAll('.ov-dl').length,
      panel: Boolean(document.querySelector('.ov-panel')),
    })`)
    const v = JSON.parse(has.value)
    if (v.panel) { return { p, v } }
    p.ws.close()
  }
  return null
}

/** panel 页的下载卡片状态快照 */
async function dlSnapshot(panelConn) {
  const r = await evalx(panelConn, `JSON.stringify([...document.querySelectorAll('.ov-dl')].map(el => ({
    name: el.querySelector('.ov-dl__name')?.textContent?.trim().slice(0, 30) ?? null,
    desc: el.querySelector('.ov-dl__desc')?.textContent?.trim() ?? null,
    iconBg: el.querySelector('.ov-dl__icon')?.className?.match(/bg-\\[\\S+\\]/)?.[0] ?? null,
    hasTrack: Boolean(el.querySelector('.ov-dl__track')),
    trackW: el.querySelector('.ov-dl__bar')?.style?.width ?? null,
    ops: el.querySelectorAll('.ov-dl__op').length,
    hasClose: Boolean(el.querySelector('.ov-dl__close')),
  })))`)
  return JSON.parse(r.value)
}

// 1. 慢速下载触发（进度态载体）+ 小文件触发（瞬时终态载体，验证堆叠）
const c1 = await evalx(lab, `(() => {
  const a = document.createElement('a')
  a.href = '/slow-download'
  document.body.appendChild(a)
  a.click()
  a.remove()
  return true
})()`)
report('同源慢速直链触发下载（20MB @ ≈10MB/s）', c1.value === true)
await sleep(500)
const c2 = await click(lab, '[data-op="download-blob"]')
report('触发小文件下载', c2 === true)
await sleep(400)

const panel1 = await findPanelPage()
report('panel 浮层页出现', Boolean(panel1))
if (!panel1) { process.exit(1) }
const snap1 = await dlSnapshot(panel1.p)
report('逐条独立卡片渲染（无聚合块）', snap1.length >= 2, `cards=${JSON.stringify(snap1.map(s => s.name))}`)
report('卡片有状态图标块（.ov-dl__icon）', snap1.every(s => s.iconBg), snap1.map(s => s.iconBg).join(','))
report('卡片有 × 关闭按钮', snap1.every(s => s.hasClose))

// 2. progressing 态：慢速下载仍在进行，应有带进度条的卡片
const progressing = snap1.filter(s => s.hasTrack)
report('progressing 显示进度条', progressing.length >= 1, JSON.stringify(snap1.map(s => ({ n: s.name, w: s.trackW }))))
report('progressing 无操作按钮', progressing.every(s => s.ops === 0))
report('进行中图标为青玉色', progressing.every(s => s.iconBg === 'bg-[#0f766e]'), progressing.map(s => s.iconBg).join(','))

// 3. 等全部到终态（不再有「下载中」卡片）：completed 绿色图标 + 「打开/文件夹」双按钮
let snapEnd = null
for (let i = 0; i < 30; i++) {
  await sleep(500)
  snapEnd = await dlSnapshot(panel1.p)
  if (snapEnd.length && snapEnd.every(s => !/下载中/.test(s.desc ?? ''))) { break }
}
report('下载到达终态（进度条消失）', snapEnd.length > 0 && snapEnd.every(s => !s.hasTrack), JSON.stringify(snapEnd.map(s => s.desc)))
report('completed 图标为绿色', snapEnd.every(s => s.iconBg === 'bg-[#16a34a]'), snapEnd.map(s => `${s.name}:${s.iconBg}`).join(' | '))
report('completed 出现「打开/文件夹」按钮', snapEnd.every(s => s.ops === 2), `ops=${snapEnd.map(s => s.ops).join(',')}`)

// 4. × 关闭第一条 → 回传 Main 过滤，卡片消失
const beforeClose = (await dlSnapshot(panel1.p)).length
const closeClicked = await click(panel1.p, '.ov-dl__close')
await sleep(900)
const afterClose = (await dlSnapshot(panel1.p)).length
report('× 关闭单条下载卡（回传 Main）', closeClicked === true && afterClose === beforeClose - 1, `${beforeClose} -> ${afterClose}`)

// 5. TTL：剩余终态卡片到时自动消失（在 30s 服务保留期内，卡片消失只能来自 TTL）
console.log('等待 10s 验证终态 TTL 自动消失…')
await sleep(10_000)
const snapTtl = await dlSnapshot(panel1.p)
report('终态卡片自动消失（TTL）', (snapTtl ?? []).length === 0, `cards=${snapTtl ? snapTtl.length : 'panel hidden/empty'}`)

// 6. 收尾确认：Main 侧下载列表仍在服务保留期，但面板无卡片（dismiss/TTL 只是隐藏展示）
const finalPanel = await findPanelPage()
report('面板无残留卡片（展示过滤生效）', !finalPanel || finalPanel.v.dl === 0, JSON.stringify(finalPanel?.v ?? null))

panel1.p.ws.close()
lab.ws.close()
summary('probe-download')
