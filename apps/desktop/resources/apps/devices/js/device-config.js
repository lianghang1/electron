'use strict'
/* 设备配置浮层入口：打开扫码枪 / 拍摄设备配置弹窗（原生浮层窗，盖过 Web 容器区域） */

$('#btn-scanner-config').addEventListener('click', () => {
  void window.desktop.overlay.openConfig('scanner')
})

$('#btn-capture-config').addEventListener('click', () => {
  void window.desktop.overlay.openConfig('capture')
})
