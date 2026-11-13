import { bootstrapAppearance, OverlayApp, ShellApp } from '@shell/ui'
import { createApp, h } from 'vue'
import '@shell/ui/styles.css'

// 挂载前同步应用启动外观：preload 已写 :root，此处补 system 模式的动态跟随
const boot = window.desktop?.shell.appearance()
if (boot) {
  bootstrapAppearance(boot.accent, boot.theme)
}

// DiagnosticsApp
// registerEmbeddedApp('/diagnostics', DiagnosticsApp)

/**
 * kiosk 看门狗恢复模式：连续崩溃后 WindowSystem 以 #/recovery 进入，
 * 渲染自检页而不是反复拉起——现场可读的故障态，而非黑屏/闪屏循环。
 */
function isRecoveryMode(): boolean {
  return window.location.hash === '#/recovery'
}

/** 原生浮层窗复用同一份 index.html：按 hash 区分形态，避免多入口产物 */
function isOverlayMode(): boolean {
  return window.location.hash.startsWith('#/overlay')
}

function mountRecovery() {
  createApp({
    render: () => h('div', {
      style: 'height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;background:#0d1117;color:#e6edf3;font-family:system-ui',
    }, [
      h('div', { style: 'font-size:40px' }, '⚠'),
      h('div', { style: 'font-size:18px;font-weight:600' }, '设备自检中'),
      h('div', { style: 'font-size:13px;color:#8b949e' }, '应用连续异常已进入恢复模式，请联系现场运维'),
      h('div', { style: 'font-size:12px;color:#6e7681' }, '重启终端可恢复 · 错误已上报'),
    ]),
  }).mount('#app')
  document.body.classList.add('ready')
}

if (isRecoveryMode()) {
  mountRecovery()
}
else if (isOverlayMode()) {
  document.getElementById('splash')?.remove()
  document.body.style.background = 'transparent'
  document.documentElement.style.background = 'transparent'
  document.body.classList.add('ready')
  createApp(OverlayApp).mount('#app')
}
else {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      createApp(ShellApp).mount('#app')
      requestAnimationFrame(() => {
        window.desktop?.markFirstPaint()
        window.dispatchEvent(new Event('shell-app-ready'))
      })
    })
  })
}
