'use strict'
/* 采集域 · 设备配置：跟随所选采集设备联动；ws 配置可编辑服务地址与摄像头
 * （华视 camsdk 用名称下拉 = GetCameraInfo 枚举，点易拍保留编号），保存即热重建适配器 */

let capConfigs = []
/** 摄像头枚举缓存（deviceId → 列表/null）：配置下拉与分辨率下拉共用，避免重复连服务 */
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

function funcTypeLabel(funcType) {
  if (funcType === 1) return '文档摄像头'
  if (funcType === 2) return '人像摄像头'
  return '摄像头'
}

/** 配置面板跟随所选设备：ws 配置出编辑表单（camsdk 摄像头下拉 / 点易拍编号），其余给无配置提示 */
function syncCapConfig() {
  const p = capSelectedConfig()
  $('#cap-cfg-ws').hidden = !p
  $('#cap-cfg-none').hidden = !!p
  if (!p) {
    const id = $('#cap-device').value
    $('#cap-cfg-none-text').textContent = id.startsWith(UVC_PREFIX)
      ? '本机摄像头走 getUserMedia，无需设备配置'
      : '所选设备为 SDK 直连 / 模拟接入，无需本地服务配置'
    return
  }
  $('#cap-url').value = p.ws.url ?? ''
  $('#cap-profile-note').textContent = `协议：${p.ws.protocol ?? 'dianyipai'}`
  if (p.ws.protocol === 'camsdk') {
    $('#fld-cap-camera').hidden = false
    $('#fld-cap-camid').hidden = true
    void fillCameraSelect(p)
  }
  else {
    $('#fld-cap-camera').hidden = true
    $('#fld-cap-camid').hidden = false
    $('#cap-camid').value = p.ws.camId ?? 0
  }
}

/** 摄像头名称下拉：GetCameraInfo 枚举（devName 展示、devNum 作值）；离线时给出可读提示 */
async function fillCameraSelect(p) {
  const sel = $('#cap-camera')
  sel.innerHTML = '<option value="">获取中…</option>'
  const cams = await fetchCamerasSafe(`ws:${p.id}`)
  if (!cams) {
    sel.innerHTML = '<option value="">无法获取（本地采集服务未运行）</option>'
    return
  }
  if (!cams.length) {
    sel.innerHTML = '<option value="">未检测到摄像头</option>'
    return
  }
  sel.innerHTML = cams.map(c =>
    `<option value="${c.id}">${esc(c.name)}（${funcTypeLabel(c.funcType)}）</option>`).join('')
  sel.value = String(cams.some(c => c.id === (p.ws.camId ?? 0)) ? (p.ws.camId ?? 0) : cams[0].id)
}

async function refreshCapConfigs() {
  try {
    capConfigs = await window.desktop.capture.getConfig()
  }
  catch { capConfigs = [] }
  syncCapConfig()
}

$('#btn-cap-save').addEventListener('click', async () => {
  const p = capSelectedConfig()
  if (!p?.ws) {
    toast('当前所选设备没有可编辑的 ws 配置', false)
    return
  }
  const url = $('#cap-url').value.trim()
  if (!/^wss?:\/\/.+:/.test(url)) {
    toast('服务地址格式应为 ws://IP:端口', false)
    return
  }
  let camId
  if (p.ws.protocol === 'camsdk') {
    camId = Number($('#cap-camera').value)
    if (!Number.isInteger(camId) || camId < 0) {
      toast('请先选择摄像头（本地采集服务未运行时无法获取列表）', false)
      return
    }
  }
  else {
    camId = Math.max(0, Number($('#cap-camid').value) || 0)
  }
  try {
    await window.desktop.capture.setConfig({ ...p, ws: { ...p.ws, url, camId } })
    toast('配置已保存，适配器已热重建')
    cameraCache.delete(`ws:${p.id}`) // 地址/摄像头可能已变，枚举缓存作废
    await refreshCapConfigs()
    await refreshCaptureDevices()
    void syncResolutionOptions()
    // 热重建已销毁旧预览会话：开着预览时用新配置自动重开
    if (wsPreviewOn) {
      wsPreviewOn = false
      await startWsPreview()
    }
  }
  catch (e) { toast(e.message, false) }
})

registerRefresher(refreshCapConfigs)
// 首刷：先加载配置（配置联动依赖），再枚举设备；两脚本均已加载完成
void (async () => {
  await refreshCapConfigs()
  await refreshCaptureDevices()
  void syncResolutionOptions()
})()
