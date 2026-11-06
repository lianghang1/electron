import type { CaptureDeviceConfig, CaptureDllBinary } from '@shell/shared'

/**
 * 出厂设备档案（代码即配置，单一数据源；清单与全部技术字段锁死，运行时仅白名单字段可调）。
 * 运行时现场调整（UI setConfig）只提交白名单覆盖并写穿 userData（启动时按白名单合并，见 service）。
 */
export const BUILT_IN_CAPTURE_CONFIGS: CaptureDeviceConfig[] = [
  {
    id: 'dianyipai-x1800',
    brand: '点易拍',
    displayName: '点易拍 X1800（本地服务 9002）',
    transport: 'ws',
    ws: { url: 'ws://localhost:9002', camId: 0, width: 1600, height: 1200 },
    capabilities: { crop: true, desewarp: true, dualPage: true },
  },
  {
    id: 'huashi-cvr100',
    brand: '华视',
    displayName: '华视 CVR-100（DLL SDK）',
    transport: 'dll',
    capabilities: { ocr: true },
  },
  {
    id: 'camsdk',
    brand: 'CamSDK',
    displayName: 'CamSDK 高拍仪（本地服务 9000）',
    transport: 'ws',
    // CamSDKServer（华夏电通「华夏扫描中间件」常驻服务，多厂商高拍仪经白名单接入）JSON 协议：
    // GetCameraInfo / OpenCamera / GetCameraVideoBuff / CameraCapture(base64) / CloseCamera
    // camId = devNum：0 为高拍仪主摄像头（Document Scanner），服务端另有副摄与内置摄像头
    ws: { url: 'ws://127.0.0.1:9000', protocol: 'camsdk', camId: 0 },
    capabilities: { crop: true, desewarp: true, maxDpi: 300 },
  },
]

/**
 * DLL 二进制注册表（档案 id → koffi 相对资源根路径与函数签名）。
 * DLL 是代码资产而非现场参数：不进档案类型、不进持久化、不在界面编辑——
 * 发送给守护进程时按档案 id 组装回 dll 段（守护进程方法表形状不变）。
 * dll.file 相对宿主资源根（resourcesRoot）。
 */
export const CAPTURE_DLL_BINARIES: Record<string, CaptureDllBinary> = {
  'huashi-cvr100': {
    file: 'devices/capture/huashi/win64/Termb.dll',
    functions: {
      Init: 'int __stdcall InitComm(int iPort)',
      ReadCard: 'int __stdcall ReadBaseMsg(unsigned char *pmsg, unsigned int *len)',
    },
  },
}
