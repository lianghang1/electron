import { createApp, h } from 'vue'
import { ShellApp } from '@shell/ui'
import '@shell/ui/styles.css'

/**
 * kiosk 看门狗恢复模式：连续崩溃后 WindowSystem 以 #/recovery 进入，
 * 渲染自检页而不是反复拉起——现场可读的故障态，而非黑屏/闪屏循环。
 */
function isRecoveryMode(): boolean {
  return window.location.hash === '#/recovery'
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
else {
  // Vue 挂载完成即撤启动层（内联 splash 见 index.html），并回传 T4 首帧打点
  createApp(ShellApp).mount('#app')
  requestAnimationFrame(() => {
    document.body.classList.add('ready')
    window.desktop?.markFirstPaint()
  })
}
