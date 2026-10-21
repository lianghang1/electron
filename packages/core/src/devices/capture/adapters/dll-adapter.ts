import type { AdapterCaptureRequest, CaptureAdapter, CaptureDevice, CaptureDeviceConfig, CaptureResult } from '@desktop/shared'
import type { DeviceHost } from '../../host/device-host'
import { CAPTURE_DLL_BINARIES } from '../configs'
import { captureError } from '../errors'

/** 守护进程探测入参的档案形状（档案本体 + 按注册表组装的 dll 段） */
type DaemonProfile = CaptureDeviceConfig & { dll?: { file: string, functions?: Record<string, string> } }

/**
 * DLL 路线适配器（厂商 C 接口 SDK，配置驱动：品牌差异在设备配置数据里，不改适配器代码）。
 *
 * DLL 的 koffi 调用与探测全部收敛在设备守护进程内执行（本适配器仅做 host RPC 路由）：
 * native 崩溃只炸守护进程，由 DeviceHost 退避重启自愈。未来厂商签名档案落地时，
 * 在守护进程侧（host/run.ts capture 域方法表）补对应方法即可，本适配器不再改动。
 * DLL 路径与函数签名由 core 内部注册表持有（不进档案/持久化），发送前按档案 id 组装。
 */
export class DllAdapter implements CaptureAdapter {
  readonly transport = 'dll' as const

  constructor(
    private readonly host: DeviceHost,
    private readonly configs: CaptureDeviceConfig[],
    /** 宿主注入的资源根（DLL 相对路径基准，寻址与探测均在守护进程内进行） */
    private readonly resourcesRoot: string,
  ) {}

  async listDevices(): Promise<CaptureDevice[]> {
    // 仅 dll 档案进守护进程探测；dll 段按注册表组装（注册表未登记的档案不送探测）
    const profiles = this.configs
      .filter(p => p.transport === 'dll')
      .map((p): DaemonProfile | null => {
        const binary = CAPTURE_DLL_BINARIES[p.id]
        return binary ? { ...p, dll: { ...binary } } : null
      })
      .filter((p): p is DaemonProfile => p !== null)
    if (profiles.length === 0) {
      return []
    }
    return this.host.request<CaptureDevice[]>('capture.listDevices', {
      resourcesRoot: this.resourcesRoot,
      profiles,
    })
  }

  async capture(req: AdapterCaptureRequest, device: CaptureDevice): Promise<CaptureResult> {
    throw captureError(
      'ADAPTER_UNAVAILABLE',
      'DLL 路线待厂商签名档案落地（拿到 SDK 文档后在守护进程内实现 capture 域方法）',
      { deviceId: device.id },
    )
  }
}
