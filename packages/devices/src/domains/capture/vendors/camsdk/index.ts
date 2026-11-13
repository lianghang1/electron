import type { CaptureCameraInfo } from '@shell/shared'
import type { CaptureVendor, WsEndpoint } from '../vendor-contracts'
import { withWsSession } from '#kernel/channel/ws-channel'
import { captureError } from '../../errors'
import { CamSdkPreviewSession } from './preview'
import { checkCamSdkFrame, frameImage, parseCamSdkFrame, sendCamSdk } from './protocol'
import { diagnoseCamSdkService, ensureCamSdkService } from './service'

/**
 * CamSDK 厂商模块（CaptureVendor）。CamSDK = 华夏电通「华夏扫描中间件」，多厂商高拍仪经白名单接入。
 * 采集序列：OpenCamera → GetCameraVideoBuff(enable) 首帧 → SetCameraImageInfo → CameraCapture(base64) → CloseCamera；
 * 枚举序列：GetCameraInfo → devInfo（funcType 1=文档 2=人像）。常驻预览见 preview.ts。
 */

/** devInfo 条目 → 统一枚举视图（分辨率兼容 resolutionList / mediaTypes[0].resolutions 两种固件） */
function toCameraInfo(dev: NonNullable<import('./protocol').CamSdkFrame['devInfo']>[number]): CaptureCameraInfo {
  return {
    id: dev.id,
    name: dev.devName,
    funcType: dev.funcType,
    resolutions: dev.resolutionList ?? dev.mediaTypes?.[0]?.resolutions ?? [],
  }
}

/** 一次性采集：开摄像头 → 等预览首帧 → 设裁切 → 拍照 → 关摄像头（JPEG base64） */
function captureOnce(endpoint: WsEndpoint, req: { resolutionNum?: number }): Promise<string> {
  const devNum = endpoint.camId ?? 0
  let previewArrived = false
  return withWsSession<string>(endpoint.url, {
    timeoutMs: 12000,
    onTimeout: () => captureError('CAPTURE_FAILED', `CamSDK 高拍仪采集超时（${endpoint.url}）`),
    onConnectError: url => captureError('DEVICE_OFFLINE', `CamSDKServer 连接失败: ${url}（确认已安装CamSDK 高拍仪 SDK 且服务运行中）`),
    onClosedEarly: () => captureError('DEVICE_OFFLINE', 'CamSDKServer 连接在采集完成前关闭'),
    run: (ws) => {
      sendCamSdk(ws, devNum, { func: 'OpenCamera', mediaNum: 0, resolutionNum: req.resolutionNum ?? 0, fps: 5 })
      sendCamSdk(ws, devNum, { func: 'GetCameraVideoBuff', enable: true })
    },
    onMessage: (ev, ws, settle) => {
      const msg = parseCamSdkFrame(ev.data)
      if (!msg) {
        return
      }
      if (msg.func === 'GetCameraVideoBuff') {
        // 预览帧持续推送：只认首帧（设备就绪标志）；enable 开关的 ACK 只带 result，按普通响应校验
        const preview = frameImage(msg)
        if (preview) {
          if (!previewArrived) {
            previewArrived = true
            sendCamSdk(ws, devNum, { func: 'SetCameraImageInfo', cropType: 1, imageType: 0, fillBorderType: 0, removalForeign: 0, rotate: 0 })
            sendCamSdk(ws, devNum, { func: 'CameraCapture', mode: 'base64' })
          }
          return
        }
        if (msg.result !== undefined) {
          checkCamSdkFrame(msg, settle)
        }
        return
      }
      if (msg.func === 'OpenCamera') {
        checkCamSdkFrame(msg, settle)
        return
      }
      if (msg.func === 'CameraCapture') {
        if (!checkCamSdkFrame(msg, settle)) {
          return
        }
        const base64 = frameImage(msg)
        if (!base64) {
          settle(captureError('CAPTURE_FAILED', 'CamSDK 高拍仪拍照成功但未返回图片数据'))
          return
        }
        sendCamSdk(ws, devNum, { func: 'CloseCamera', devNum })
        settle(undefined, base64)
      }
    },
  })
}

/** 枚举本机服务下的摄像头（连接 → GetCameraInfo → 关闭；不占用摄像头） */
function listCameras(endpoint: WsEndpoint): Promise<CaptureCameraInfo[]> {
  return withWsSession<CaptureCameraInfo[]>(endpoint.url, {
    timeoutMs: 6000,
    onTimeout: () => captureError('DEVICE_OFFLINE', `CamSDKServer 枚举超时（${endpoint.url}）`),
    onConnectError: url => captureError('DEVICE_OFFLINE', `CamSDKServer 连接失败: ${url}`),
    onClosedEarly: () => captureError('DEVICE_OFFLINE', 'CamSDKServer 连接在枚举完成前关闭'),
    run: (ws) => {
      ws.send(JSON.stringify({ func: 'GetCameraInfo', reqId: String(Date.now()) }))
    },
    onMessage: (ev, _ws, settle) => {
      const msg = parseCamSdkFrame(ev.data)
      if (!msg || msg.func !== 'GetCameraInfo') {
        return
      }
      if (msg.result !== 0) {
        settle(captureError('CAPTURE_FAILED', `CamSDK 高拍仪枚举失败（result=${String(msg.result)}）：${String(msg.errorMsg ?? '未知错误')}`))
        return
      }
      settle(undefined, (msg.devInfo ?? []).map(toCameraInfo))
    },
  })
}

export const camSdkVendor: CaptureVendor = {
  vendorId: 'camsdk',
  captureOnce,
  listCameras,
  createPreviewSession: (endpoint, opts, onFrame) => new CamSdkPreviewSession(endpoint, opts.resolutionNum ?? 0, onFrame),
  ensureService: ensureCamSdkService,
  offlineDiagnose: diagnoseCamSdkService,
}
