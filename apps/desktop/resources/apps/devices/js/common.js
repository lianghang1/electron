'use strict'
/* 公共工具与页签；各设备模块（print/idcard/capture/scanner）经 registerRefresher 接入顶栏刷新 */

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

// ── 页签 ──
document.querySelectorAll('.nav-tab').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.nav-tab').forEach(b => b.classList.toggle('active', b === btn))
    document.querySelectorAll('.page').forEach(p => p.classList.toggle('active', p.id === `page-${btn.dataset.page}`))
  })
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
