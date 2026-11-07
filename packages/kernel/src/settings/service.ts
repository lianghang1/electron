import type { SettingGroup, SettingsValues } from '@shell/shared'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { app, ipcMain } from 'electron'
import { SETTINGS_SCHEMA } from '@shell/shared'
import { configDir } from '../storage/app-paths'

/**
 * 设置服务（VS Code schema 驱动模式）：SETTINGS_SCHEMA 是唯一事实源——
 * 类型、默认值、存储、UI 面板全部由 schema 派生，新增设置项 = 加一个字段。
 * 存储：platform/storage/settings.json（只存显式覆盖值，缺省走 schema default）。
 */

const SETTINGS_FILE = 'settings.json'

let cache: SettingsValues | null = null

function filePath(): string {
  return join(configDir(), SETTINGS_FILE)
}

function defaults(): SettingsValues {
  const values: SettingsValues = {}
  for (const group of SETTINGS_SCHEMA) {
    values[group.key] = Object.fromEntries(group.fields.map(f => [f.key, f.default]))
  }
  return values
}

function load(): SettingsValues {
  if (cache)
    return cache
  const base = defaults()
  try {
    if (existsSync(filePath())) {
      const stored = JSON.parse(readFileSync(filePath(), 'utf-8')) as SettingsValues
      // 深合并：schema 新增字段自动获得默认值，存储里多余的字段忽略
      for (const [groupKey, group] of Object.entries(stored)) {
        base[groupKey] = { ...base[groupKey], ...group }
      }
    }
  }
  catch {
    // 设置文件损坏不阻断启动：回到全默认并让下次写入覆盖
  }
  cache = base
  return base
}

function persist(values: SettingsValues): void {
  mkdirSync(configDir(), { recursive: true })
  writeFileSync(filePath(), JSON.stringify(values, null, 2))
}

/** 全量（schema + 当前值），设置面板直接渲染 */
export function settingsSnapshot(): { schema: SettingGroup[], values: SettingsValues } {
  return { schema: SETTINGS_SCHEMA, values: load() }
}

function applySideEffects(key: string, value: unknown): void {
  // 副作用收敛在这一处；新增有副作用的设置项在此追加分支
  if (key === 'general.launchAtLogin') {
    app.setLoginItemSettings({ openAtLogin: value === true })
  }
}

/** 设置单项：key 形如 "general.launchAtLogin"，值按 schema 类型校验 */
export function setSetting(key: string, value: unknown): void {
  const [groupKey, fieldKey] = key.split('.')
  const group = SETTINGS_SCHEMA.find(g => g.key === groupKey)
  const field = group?.fields.find(f => f.key === fieldKey)
  if (!field)
    throw new Error(`[settings] unknown key: ${key}`)

  const typeOk
    = (field.type === 'boolean' && typeof value === 'boolean')
      || (field.type === 'string' && typeof value === 'string')
      || (field.type === 'number' && typeof value === 'number')
      || (field.type === 'enum' && typeof value === 'string'
        && (!field.options || field.options.some(o => o.value === value)))
  if (!typeOk)
    throw new Error(`[settings] invalid value for ${key}`)

  const values = load()
  values[groupKey!] = { ...values[groupKey!], [fieldKey!]: value }
  persist(values)
  applySideEffects(key, value)
}

/** 组合根调用：接线设置 IPC 通道 */
export function registerSettingsIpc(ipc: Electron.IpcMain): void {
  ipc.handle('settings:all', () => settingsSnapshot())
  ipc.handle('settings:set', (_e, key: string, value: unknown) => setSetting(key, value))
}

/** 启动时应用一次持久化的副作用设置（如开机自启在安装器里可能被重置） */
export function applySettingsSideEffects(): void {
  const values = load()
  applySideEffects('general.launchAtLogin', values.general?.launchAtLogin)
}
