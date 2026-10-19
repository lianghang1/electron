/**
 * @desktop/ui — 平台内置 UI 层：设备浮层 UI（Vue 组件 + composable，独立于 Shell 主题自绘）
 * 与 Desktop Shell（Tab 多应用框架，dt-* 主题令牌）。
 *
 * 组件运行在 OverlayWindow 浮层窗（经 OverlayApp 挂载）或 Shell 主窗，宿主 App 亦可嵌入自用；
 * 与平台桥（window.desktop）联动，高帧率数据（预览帧/笔迹点）在浮层窗内闭环，
 * 业务结果经桥回传发起方。按功能域组织：src/<domain>/，Shell 在 src/shell/。
 */
export { default as CaptureDialog } from './capture/CaptureDialog.vue'
export { default as CaptureStage } from './capture/CaptureStage.vue'
export { useCaptureSession } from './capture/use-capture-session'
export { default as ConfigDialogShell } from './dialog/ConfigDialogShell.vue'
export { mountPlatformApp, mountShellApp } from './mount'
export { default as OverlayApp } from './overlay/OverlayApp.vue'
export { useOverlayStore } from './overlay/use-overlay-store'
export { default as UiScrollArea } from './scroll/UiScrollArea.vue'
export { default as UiSelect } from './select/UiSelect.vue'
export { default as SystemSettingsDialog } from './settings/SystemSettingsDialog.vue'
export { useApps } from './shell/composables/use-apps'
export { useTabs } from './shell/composables/use-tabs'
export { useTheme } from './shell/composables/use-theme'
export { useAsarUpdateState, useUpdateState } from './shell/composables/use-update'
export { default as ShellApp } from './shell/ShellApp.vue'
