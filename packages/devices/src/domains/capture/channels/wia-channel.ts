import type { CaptureChannel, CaptureDevice, CaptureResult, ChannelCaptureRequest } from '@shell/shared'
import { execFile } from 'node:child_process'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { isWindowsHost } from '../../platform'
import { captureError } from '../errors'

/**
 * WIA 标准驱动通道（Windows 自带 WIA COM，高拍仪/扫描仪装驱动即可用，不绑厂商）。
 * 通过 PowerShell 脚本调用 WIA COM：枚举设备 / 无界面转存图片。
 * 未插设备 → 设备列表为空；插上 WIA 设备后无需改任何代码即可出图。
 */
export class WiaChannel implements CaptureChannel {
  readonly transport = 'wia' as const

  private run(script: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const child = execFile(
        'powershell',
        ['-NoProfile', '-NonInteractive', '-Command', script],
        { windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
        (err, stdout, stderr) => {
          if (err && !stdout) { reject(new Error(stderr || err.message)) }
          else { resolve(stdout) }
        },
      )
      child.on('error', () => reject(new Error('PowerShell 不可用')))
    })
  }

  async listDevices(): Promise<CaptureDevice[]> {
    if (!isWindowsHost()) { return [] }
    const script = `
      $ErrorActionPreference = 'Stop'
      try {
        $dm = New-Object -ComObject WIA.DeviceManager
        $out = @()
        foreach ($info in $dm.DeviceInfos) {
          if ($info.Type -ne 1) { continue }  # 1 = ScannerDevice
          $name = ''
          foreach ($p in $info.Properties) { if ($p.Name -eq 'Name') { $name = [string]$p.Value } }
          $out += [pscustomobject]@{ id = $info.DeviceID; name = $name }
        }
        $out | ConvertTo-Json -Compress
      } catch { '[]' }
    `
    try {
      const out = await this.run(script)
      const parsed = JSON.parse(out.trim() || '[]') as Array<{ id: string, name: string }> | { id: string, name: string }
      const list = Array.isArray(parsed) ? parsed : [parsed]
      return list.filter(d => d?.id).map(d => ({
        id: `wia:${d.id}`,
        displayName: d.name || 'WIA 扫描设备',
        brand: 'WIA',
        transport: 'wia' as const,
        status: 'ready' as const,
        capabilities: { crop: false, desewarp: false },
        meta: { wiaDeviceId: d.id },
      }))
    }
    catch {
      return []
    }
  }

  async capture(req: ChannelCaptureRequest, device: CaptureDevice): Promise<CaptureResult> {
    const wiaId = String(device.meta.wiaDeviceId ?? '')
    if (!wiaId) { throw captureError('VALIDATION_FAILED', '缺少 WIA DeviceID') }

    const dir = req.saveDir
    await mkdir(dir, { recursive: true })
    const file = path.join(dir, `wia-${Date.now()}.jpg`)

    const script = `
      $ErrorActionPreference = 'Stop'
      $dm = New-Object -ComObject WIA.DeviceManager
      $dev = $dm.DeviceInfos | Where-Object { $_.DeviceID -eq '${wiaId.replace(/'/g, '\'\'')}' } | ForEach-Object { $_.Connect() }
      if (-not $dev) { throw 'device not found' }
      $item = $dev.Items | Select-Object -First 1
      $img = $item.Transfer('{B96B3CAE-0728-11D3-9D7B-0000F81EF32E}')  # JPEG
      $img.SaveFile('${file.replace(/\\/g, '\\\\').replace(/'/g, '\'\'')}')
      Write-Output 'OK'
    `
    try {
      const out = await this.run(script)
      if (!out.includes('OK')) { throw new Error('WIA 转存未完成') }
    }
    catch (err) {
      throw captureError('CAPTURE_FAILED', `WIA 采集失败: ${String(err)}`, { wiaId })
    }

    return { imagePath: file, meta: { transport: 'wia', wiaId } }
  }
}
