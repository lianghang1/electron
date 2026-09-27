import type { FhBusinessConfig } from '../../src/types/funeral'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { app } from 'electron'

const DEFAULT_CONFIG: FhBusinessConfig = {
  machineId: 'FH-0001',
  hallName: '市殡仪馆',
  counterName: '自助结算柜台',
}

/** 运维授权密码默认值（config.json 的 adminPassword 字段可覆盖，不进 FhBusinessConfig 契约） */
const DEFAULT_ADMIN_PASSWORD = '888888'

function configFilePath(): string {
  return path.join(app.getPath('userData'), 'config.json')
}

/**
 * 业务配置：userData/config.json（部署时按机器落盘）浅覆盖默认值。
 * 解析失败不阻塞启动（自助机必须能起来），直接用默认值。
 */
export function loadBusinessConfig(): FhBusinessConfig {
  try {
    const raw = JSON.parse(readFileSync(configFilePath(), 'utf8')) as Partial<FhBusinessConfig>
    return { ...DEFAULT_CONFIG, ...raw }
  }
  catch {
    return DEFAULT_CONFIG
  }
}

/**
 * 设置面板保存：与现文件浅合并写回（保留 adminPassword 等非契约字段），
 * 并返回合并后的业务配置。写失败抛错由 renderer 提示。
 */
export function saveBusinessConfig(partial: Partial<FhBusinessConfig>): FhBusinessConfig {
  let existing: Record<string, unknown> = {}
  try {
    existing = JSON.parse(readFileSync(configFilePath(), 'utf8')) as Record<string, unknown>
  }
  catch {
    // 无文件 / 解析失败：从默认值起写
  }
  const merged = { ...existing, ...partial }
  writeFileSync(configFilePath(), JSON.stringify(merged, null, 2), 'utf8')
  return { ...DEFAULT_CONFIG, ...merged } as FhBusinessConfig
}

/** 运维授权密码：config.json 的 adminPassword（部署时按机器配置） */
export function loadAdminPassword(): string {
  try {
    const raw = JSON.parse(readFileSync(configFilePath(), 'utf8')) as { adminPassword?: string }
    return raw.adminPassword || DEFAULT_ADMIN_PASSWORD
  }
  catch {
    return DEFAULT_ADMIN_PASSWORD
  }
}
