/**
 * @desktop/ui — 平台内置设备 UI（Vue 组件 + composable，独立于 Shell 主题自绘）。
 *
 * 组件运行在 OverlayWindow 浮层窗（经 OverlayApp 挂载），宿主 App 亦可嵌入自用；
 * 与平台桥（window.desktop）联动，高帧率数据（预览帧/笔迹点）在浮层窗内闭环，
 * 业务结果经桥回传发起方。按设备功能域组织：src/<domain>/。
 */
export { default as CaptureConfigDialog } from './capture/CaptureConfigDialog.vue'
export { default as CaptureDialog } from './capture/CaptureDialog.vue'
export { default as CaptureStage } from './capture/CaptureStage.vue'
export { useCaptureSession } from './capture/use-capture-session'
export { default as ScannerConfigDialog } from './scanner/ScannerConfigDialog.vue'
