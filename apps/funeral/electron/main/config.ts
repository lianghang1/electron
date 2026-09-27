import type { FhBusinessConfig } from '../../src/types/funeral'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { app } from 'electron'

const DEFAULT_CONFIG: FhBusinessConfig = {
  machineId: 'FH-0001',
  hallName: '市殡仪馆',
  counterName: '自助结算柜台',
}

/**
 * 业务配置：userData/config.json（部署时按机器落盘）浅覆盖默认值。
 * 解析失败不阻塞启动（自助机必须能起来），直接用默认值。
 */
export function loadBusinessConfig(): FhBusinessConfig {
  try {
    const file = path.join(app.getPath('userData'), 'config.json')
    const raw = JSON.parse(readFileSync(file, 'utf8')) as Partial<FhBusinessConfig>
    return { ...DEFAULT_CONFIG, ...raw }
  }
  catch {
    return DEFAULT_CONFIG
  }
}
