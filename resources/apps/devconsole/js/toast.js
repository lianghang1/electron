/**
 * 全局操作反馈横条：底部居中、成败双色、约 2.6s 自动消失。
 * 挂载点为 index.html 的 #dc-toast（置于 Vue 应用根之外，直改 DOM）。
 */
let toastTimer = null

export function toast(msg, ok = true) {
  const el = document.getElementById('dc-toast')
  if (!el) { return }
  el.textContent = msg
  el.classList.toggle('err', !ok)
  el.classList.add('show')
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600)
}
