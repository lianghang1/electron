import type { CaptureDeviceConfig } from '@desktop/shared'

/**
 * 出厂设备配置（代码即配置，单一数据源）。
 * 运行时编辑（UI setConfig）写入 userData 持久化（core 经 electron-store，启动时回注 initialConfigs）。
 * dll.file 相对宿主资源根（resourcesRoot）；运行时编辑可填绝对路径。
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
    dll: {
      file: 'devices/capture/huashi/win64/Termb.dll',
      functions: {
        Init: 'int __stdcall InitComm(int iPort)',
        ReadCard: 'int __stdcall ReadBaseMsg(unsigned char *pmsg, unsigned int *len)',
      },
    },
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
