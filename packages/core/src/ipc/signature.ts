import type { SignatureConfig, SignStartResult, SignStrokePoint } from '@desktop/shared'
import type { WebContents } from 'electron'
import type { SignatureSystem } from '../devices/signature'
import { signatureError } from '../devices/signature/errors'
import { handle } from './handle'
import { isWsUrl } from './ws-url'

export interface SignatureIpcDeps {
  /** 签名系统（bootstrap 装配）；未装配时调用抛统一错误，由 createHandle 编码回传 */
  signature?: SignatureSystem
}

function requireSystem(system: SignatureSystem | undefined): SignatureSystem {
  if (!system) {
    throw signatureError('ADAPTER_UNAVAILABLE', '签名系统未装配（bootstrap 未配置 devices）')
  }
  return system
}

/**
 * signature 域通道注册：手写签名（会话式 + 笔迹点实时推送）。
 * 失败统一 reject（SignatureError → IpcRemoteError，code 见 SignErrorCode，渲染层 try/catch 分支）；
 * 笔迹点只推给发起会话的窗口（webContents 直发，不走全局事件广播）。
 */
export function registerSignatureIpc(deps: SignatureIpcDeps): void {
  handle('signature:listDevices', () => requireSystem(deps.signature).listDevices())
  handle('signature:startSign', (e, req) => startSign(requireSystem(deps.signature), e.sender, req))
  handle('signature:stopSign', () => requireSystem(deps.signature).stop())
  handle('signature:clearSign', () => requireSystem(deps.signature).clear())
  handle('signature:cancelSign', () => requireSystem(deps.signature).cancel())
  handle('signature:getConfig', () => requireSystem(deps.signature).getConfig())
  handle('signature:patchConfig', (_e, patch) => requireSystem(deps.signature).setConfig(sanitizeConfig(patch)))
}

/** 配置补丁入参收敛：ws 服务地址仅接受 ws://|wss:// 前缀，非法值丢弃（不污染持久化 store） */
function sanitizeConfig(patch: Partial<SignatureConfig> | undefined): Partial<SignatureConfig> {
  const out: Partial<SignatureConfig> = {}
  if (isWsUrl(patch?.wsUrl)) {
    out.wsUrl = patch.wsUrl.trim()
  }
  return out
}

/** 开始会话：笔迹推送回调绑定发起方窗口（窗口销毁后静默丢弃，由 stopSign 正常回收） */
async function startSign(system: SignatureSystem, sender: WebContents, req?: { deviceId?: string }): Promise<SignStartResult> {
  return system.start(req, (point: SignStrokePoint) => {
    if (!sender.isDestroyed()) {
      sender.send('signature:strokeReceived', point)
    }
  })
}
