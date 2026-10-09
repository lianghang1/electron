import type { CaptureDeviceProfile } from '@desktop/shared'

/**
 * 出厂设备档案（代码即档案，单一数据源）。
 * 运行时编辑（UI upsert）写入 userData 持久化（core 经 electron-store，启动时回注 initialProfiles）。
 * dll.file 相对宿主资源根（resourcesRoot）；运行时编辑可填绝对路径。
 */
export const BUILT_IN_CAPTURE_PROFILES: CaptureDeviceProfile[] = [
  {
    id: 'dianyipai-x1800',
    brand: '点易拍',
    displayName: '点易拍 X1800（本地服务 9002）',
    transport: 'ws',
    ws: { url: 'ws://localhost:9002', camId: 0, width: 1600, height: 1200 },
    capabilities: { crop: true, desewarp: true, dualPage: true },
  },
  {
    id: 'zhaolin-zl1000',
    brand: '哲林',
    displayName: '哲林 ZL-1000（DLL SDK）',
    transport: 'dll',
    dll: {
      file: 'devices/zhaolin/ZLSDK.dll',
      functions: {
        DevOpen: 'int __stdcall DevOpen(int nType, int nIndex)',
        DevCapture: 'int __stdcall DevCapture(int hDev)',
        DevClose: 'int __stdcall DevClose(int hDev)',
      },
    },
    capabilities: { crop: true, desewarp: true, ocr: true },
  },
  {
    id: 'huashi-cvr100',
    brand: '华视',
    displayName: '华视 CVR-100（DLL SDK）',
    transport: 'dll',
    dll: {
      file: 'devices/huashi/Termb.dll',
      functions: {
        Init: 'int __stdcall InitComm(int iPort)',
        ReadCard: 'int __stdcall ReadBaseMsg(unsigned char *pmsg, unsigned int *len)',
      },
    },
    capabilities: { ocr: true },
  },
  {
    id: 'huashi-camsdk-9000',
    brand: '华视',
    displayName: '华视高拍仪（本地服务 9000）',
    transport: 'ws',
    // 华视 CamSDKServer（高拍仪 SDK 常驻服务）JSON 协议：
    // GetCameraInfo / OpenCamera / GetCameraVideoBuff / CameraCapture(base64) / CloseCamera
    // camId = devNum：0 为高拍仪主摄像头（Document Scanner），服务端另有副摄与内置摄像头
    ws: { url: 'ws://127.0.0.1:9000', protocol: 'camsdk', camId: 0 },
    capabilities: { crop: true, desewarp: true, maxDpi: 300 },
  },
]
