'use strict'
/* 设备配置浮层入口：打开对应设备域的系统设置弹窗页签（原生浮层窗，盖过 Web 容器区域） */

$('#btn-scanner-config').addEventListener('click', () => {
  void window.desktop.overlay.openConfig('scanner')
})

$('#btn-capture-config').addEventListener('click', () => {
  void window.desktop.overlay.openConfig('capture')
})

$('#btn-id-config').addEventListener('click', () => {
  void window.desktop.overlay.openConfig('idcard')
})

$('#btn-sign-config').addEventListener('click', () => {
  void window.desktop.overlay.openConfig('signature')
})
