import type { AdapterCaptureRequest, CaptureAdapter, CaptureDevice, CaptureDeviceProfile, CaptureResult } from '@desktop/shared'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { koffiAvailable } from '../../idcard/drivers/koffi'
import { captureError } from '../errors'

/**
 * DLL 路线适配器（华视/哲林等厂商 C 接口 SDK）。
 *
 * 架构说明：
 * - 档案驱动：品牌差异在设备档案（DLL 路径 + koffi 函数签名）里（出厂值 profiles.ts / 运行时编辑 userData），
 *   拿到厂商 .h 头文件后填签名即可，不改适配器代码。
 * - 生产形态：加载 DLL 应放入 utilityProcess 子进程（崩溃隔离、回调线程隔离），
 *   本骨架先在主进程内懒加载 koffi（未安装/未配置 DLL 时明确报不可用），真机联调后再加固。
 *
 * koffi 对接范式（拿到 SDK 文档后照此填档案与实现）：
 *   const koffi = require('koffi')
 *   const lib = koffi.load(dllFile)                        // 64 位 DLL 对应 64 位 Electron
 *   const open = lib.func('int __stdcall DevOpen(int nType, int nIndex)')
 *   const capture = lib.func('int __stdcall DevCapture(int hDev)')
 *   const cb = koffi.register('void __stdcall(int code)', koffi.types.int)  // 事件回调
 */
export class DllAdapter implements CaptureAdapter {
  readonly transport = 'dll' as const

  constructor(
    private readonly profiles: CaptureDeviceProfile[],
    /** 宿主注入的资源根（DLL 相对路径的基准目录） */
    private readonly resourcesRoot: string,
  ) {}

  async listDevices(): Promise<CaptureDevice[]> {
    return this.profiles
      .filter(p => p.transport === 'dll' && p.dll)
      .map((p) => {
        const file = p.dll!.file
        const dllPath = path.isAbsolute(file) ? file : path.join(this.resourcesRoot, file)
        const koffiInstalled = koffiAvailable()
        return {
          id: `dll:${p.id}`,
          displayName: p.displayName,
          brand: p.brand,
          transport: 'dll' as const,
          status: !koffiInstalled
            ? ('unavailable' as const)
            : existsSync(dllPath)
              ? ('ready' as const)
              : ('offline' as const),
          capabilities: { crop: true, desewarp: true, dualPage: true, ocr: true, ...(p.capabilities ?? {}) },
          meta: {
            dllFile: p.dll!.file,
            functions: Object.keys(p.dll!.functions ?? {}),
            note: koffiInstalled ? '待填厂商函数签名后可用' : '需安装 koffi 依赖',
          },
        }
      })
  }

  async capture(req: AdapterCaptureRequest, device: CaptureDevice): Promise<CaptureResult> {
    throw captureError(
      'ADAPTER_UNAVAILABLE',
      'DLL 路线为骨架：拿到厂商 SDK 文档（.h 函数签名 + DLL 位数）后，按本文件头部的 koffi 范式实现 capture；'
      + '生产建议将 DLL 调用移入 utilityProcess 子进程（崩溃隔离）',
      { deviceId: device.id, profile: device.meta },
    )
  }
}
