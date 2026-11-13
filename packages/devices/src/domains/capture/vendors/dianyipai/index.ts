import type { CaptureVendor, WsEndpoint } from './vendor-contracts'
import { withWsSession } from '../../../kernel/channel/ws-channel'
import { captureError } from '../errors'

/**
 * 点易拍 BaucheSDK 厂商模块（CaptureVendor，9002 端口）。
 * 协议源自点易拍 SDK Sample/html/js/WsUtil.js：
 *   帧格式：二进制 = 0xEF + cmd + len + payload；文本 = "GetPicBase64:<base64>" 等回执
 *   开预览：EF 25 05 camId wHi wLo hHi hLo（预览帧到达后设备才可拍照）
 *   拍照：  EF 0A 01 00                    → 文本回执 GetPicBase64:<jpg base64>
 *   关预览：EF 08 00
 * 仅支持一次性采集；常驻预览/摄像头枚举未实现（契约可选方法缺省）。
 */

/** EF 帧封装：0xEF + cmd + payload 长度 + payload */
function dypFrame(cmd: number, payload: number[]): ArrayBuffer {
  const a = new Uint8Array(2 + payload.length + 1)
  a[0] = 0xEF
  a[1] = cmd
  a[2] = payload.length
  payload.forEach((v, i) => (a[3 + i] = v))
  return a.buffer
}

const GET_PIC_PREFIX = 'GetPicBase64:'

/** 一次性采集：开预览 → 延迟 700ms 发拍照 → 收 GetPicBase64 回执（JPEG base64） */
function captureOnce(endpoint: WsEndpoint, _req: { resolutionNum?: number }): Promise<string> {
  const camId = endpoint.camId ?? 0
  const w = endpoint.width ?? 1600
  const h = endpoint.height ?? 1200
  return withWsSession<string>(endpoint.url, {
    timeoutMs: 12000,
    onTimeout: () => captureError('CAPTURE_FAILED', `采集超时（${endpoint.url}）`),
    onConnectError: url => captureError('DEVICE_OFFLINE', `WebSocket 连接失败: ${url}`),
    onClosedEarly: () => captureError('DEVICE_OFFLINE', '服务连接在采集完成前关闭'),
    run: (ws, _settle, onDispose) => {
      ws.binaryType = 'arraybuffer'
      ws.send(dypFrame(0x25, [camId, Math.floor(w / 256), w % 256, Math.floor(h / 256), h % 256]))
      // 拍照指令延迟发送（预览稳定后拍照）；settle 时必达清理，防向已关闭连接发帧
      const captureTimer = setTimeout(() => {
        try {
          ws.send(dypFrame(0x0A, [0x00]))
        }
        catch {
          /* 连接已断时忽略（会话将由 onclose 收尾） */
        }
      }, 700)
      onDispose(() => clearTimeout(captureTimer))
    },
    onMessage: (ev, _ws, settle) => {
      if (typeof ev.data === 'string' && ev.data.startsWith(GET_PIC_PREFIX)) {
        settle(undefined, ev.data.slice(GET_PIC_PREFIX.length))
      }
      // 二进制 EF 05 预览帧忽略
    },
  })
}

export const dianyipaiVendor: CaptureVendor = {
  vendorId: 'dianyipai',
  captureOnce,
}
