'use strict'
/* 采集域 · 设备档案数据：加载 capture 配置与摄像头枚举缓存，供设备下拉 / 分辨率联动；
   配置编辑在系统设置弹窗，热生效后经「刷新设备」或页签激活重载 */

let capConfigs = []
/** 摄像头枚举缓存（deviceId → 列表/null）：分辨率下拉等共用，避免重复连服务 */
const cameraCache = new Map()

/** 当前选中采集设备对应的 ws 配置（非 ws 设备或配置缺失返回 null） */
function capSelectedConfig() {
  const id = $('#cap-device').value
  if (!id.startsWith('ws:')) return null
  return capConfigs.find(p => p.id === id.slice(3) && p.ws) ?? null
}

/** 枚举设备摄像头（失败返回 null：服务离线等），按设备缓存 */
async function fetchCamerasSafe(deviceId) {
  if (cameraCache.has(deviceId)) return cameraCache.get(deviceId)
  try {
    const cams = await window.desktop.capture.listCameras(deviceId)
    cameraCache.set(deviceId, cams)
    return cams
  }
  catch {
    cameraCache.set(deviceId, null)
    return null
  }
}

async function refreshCapConfigs() {
  try {
    capConfigs = await window.desktop.capture.getConfig()
  }
  catch { capConfigs = [] }
}

/** 采集页签首次初始化：先取设备档案（分辨率联动依赖），再枚举设备下拉 */
async function initCaptureTab() {
  await refreshCapConfigs()
  await refreshCaptureDevices()
  void syncResolutionOptions()
}

/** 再次进入采集页签：重新枚举设备与分辨率档位 */
async function refreshCaptureTab() {
  await refreshCaptureDevices()
  void syncResolutionOptions()
}

registerRefresher(refreshCapConfigs)
registerTab('capture', { once: initCaptureTab, activate: refreshCaptureTab, deactivate: stopLiveAndResetStage })
