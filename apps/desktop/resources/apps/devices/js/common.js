'use strict'
/* 公共工具与页签路由；各设备模块经 registerTab 接入页签生命周期（首次初始化 / 再次激活刷新 / 离开回收），
   经 registerRefresher 接入顶栏「刷新设备」 */

const $ = sel => document.querySelector(sel)
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

const SOURCE_LABEL = { system: '系统打印机', ipp: 'IPP' }
const STATE_LABEL = { accepted: '已受理', printing: '打印中', done: '已完成', failed: '失败' }
const TRANSPORT_LABEL = { ws: '本地服务', dll: 'SDK 直连', service: '本地服务', wia: 'WIA', uvc: 'UVC' }

let toastTimer = null
function toast(msg, ok = true) {
  const el = $('#toast')
  el.textContent = msg
  el.classList.toggle('err', !ok)
  el.classList.add('show')
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600)
}

function fmtTime(v) {
  if (!v) return '—'
  const d = new Date(typeof v === 'number' ? v : v)
  const p = n => String(n).padStart(2, '0')
  return `${d.getMonth() + 1}-${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

// ── 页签路由：默认进入拍摄页签；首次激活执行 once，再次激活执行 activate，离开执行 deactivate ──
const DEFAULT_TAB = 'capture'
const tabHooks = new Map()
let activeTab = null

function registerTab(name, hooks) {
  tabHooks.set(name, hooks)
}

function showTab(name) {
  if (name === activeTab) return
  void tabHooks.get(activeTab)?.deactivate?.()
  activeTab = name
  document.querySelectorAll('.nav-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === name))
  document.querySelectorAll('.page').forEach(p => p.classList.toggle('active', p.id === `page-${name}`))
  const hooks = tabHooks.get(name)
  if (!hooks) return
  if (hooks.inited) {
    void hooks.activate?.()
  }
  else {
    hooks.inited = true
    void hooks.once?.()
  }
}

document.querySelectorAll('.nav-tab').forEach((btn) => {
  btn.addEventListener('click', () => showTab(btn.dataset.tab))
})

// ── 刷新编排：各模块注册自己的刷新函数，顶栏按钮统一触发 ──
const refreshers = []
function registerRefresher(fn) {
  refreshers.push(fn)
}

$('#btn-refresh').addEventListener('click', async () => {
  await Promise.all(refreshers.map(fn => fn()))
  $('#updated-at').textContent = `更新于 ${fmtTime(Date.now())}`
})

// 首屏进入默认页签（DOMContentLoaded 时各模块已完成注册）
document.addEventListener('DOMContentLoaded', () => showTab(DEFAULT_TAB))
