import type { SignActionResult, SignDevice, SignSessionResult, SignStartResult, SignStrokePoint } from '@desktop/shared'
import type { SignatureSystem } from '../devices/signature'
import type { WebContents } from 'electron'
import { handle } from './handle'

export interface SignatureIpcDeps {
  /** 签名系统（bootstrap 装配）；未装配时调用返回统一错误结果，不拒绝 */
  signature?: SignatureSystem
}

/**
 * signature 域通道注册：手写签名（会话式 + 笔迹点实时推送）。
 * 硬件操作永不 reject，失败以结果对象的 error 字段回传（渲染层无需 try/catch）；
 * 笔迹点只推给发起会话的窗口（webContents 直发，不走全局事件广播）。
 */
export function registerSignatureIpc(deps: SignatureIpcDeps): void {
  handle('signature:listDevices', () => listDevices(deps.signature))
  handle('signature:startSign', (e, req) => startSign(deps.signature, e.sender, req))
  handle('signature:stopSign', () => stopSign(deps.signature))
  handle('signature:clearSign', () => clearSign(deps.signature))
  handle('signature:cancelSign', () => cancelSign(deps.signature))
}

/** 列出签名设备：系统未装配返回统一错误结果 */
async function listDevices(system: SignatureSystem | undefined): Promise<{ ok: true, devices: SignDevice[] } | { ok: false, error: { code: string, message: string } }> {
  if (!system) {
    return { ok: false, error: { code: 'ADAPTER_UNAVAILABLE', message: '签名系统未装配（bootstrap 未配置 devices）' } }
  }
  return { ok: true, devices: await system.listDevices() }
}

/** 开始会话：笔迹推送回调绑定发起方窗口（窗口销毁后静默丢弃，由 stopSign 正常回收） */
async function startSign(system: SignatureSystem | undefined, sender: WebContents, req?: { deviceId?: string }): Promise<SignStartResult> {
  if (!system) {
    return { ok: false, error: { code: 'ADAPTER_UNAVAILABLE', message: '签名系统未装配（bootstrap 未配置 devices）' } }
  }
  return system.start(req, (point: SignStrokePoint) => {
    if (!sender.isDestroyed()) {
      sender.send('signature:onStroke', point)
    }
  })
}

async function stopSign(system: SignatureSystem | undefined): Promise<SignSessionResult> {
  if (!system) {
    return { ok: false, error: { code: 'ADAPTER_UNAVAILABLE', message: '签名系统未装配（bootstrap 未配置 devices）' } }
  }
  return system.stop()
}

async function clearSign(system: SignatureSystem | undefined): Promise<SignActionResult> {
  if (!system) {
    return { ok: false, error: { code: 'ADAPTER_UNAVAILABLE', message: '签名系统未装配（bootstrap 未配置 devices）' } }
  }
  return system.clear()
}

async function cancelSign(system: SignatureSystem | undefined): Promise<SignActionResult> {
  if (!system) {
    return { ok: false, error: { code: 'ADAPTER_UNAVAILABLE', message: '签名系统未装配（bootstrap 未配置 devices）' } }
  }
  return system.cancel()
}
