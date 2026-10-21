'use strict'
/* 设备配置入口：各设备页签的「配置」按钮打开系统设置弹窗对应设备页签（原生浮层窗，盖过 Web 容器区域） */

document.querySelectorAll('[data-config]').forEach((btn) => {
  btn.addEventListener('click', () => {
    void window.desktop.overlay.openConfig(btn.dataset.config)
  })
})
