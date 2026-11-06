import { z } from 'zod'

/**
 * 设置 schema：统一设置的唯一事实源。
 * 新增设置项 = 在某个分组加一个字段——类型、存储、UI 面板三处自动同步。
 */
export const settingFieldTypes = ['boolean', 'string', 'enum', 'number'] as const

export interface SettingField<T = unknown> {
  key: string
  label: string
  type: (typeof settingFieldTypes)[number]
  default: T
  /** enum 类型的可选项 */
  options?: readonly { value: string; label: string }[]
  /** 描述（设置面板的次级说明文字） */
  description?: string
  /** kiosk 模式下是否隐藏（终端现场不该出现的设置） */
  hiddenInKiosk?: boolean
  /** 变更后需要重启才生效 */
  requiresRestart?: boolean
}

export interface SettingGroup {
  key: string
  label: string
  fields: SettingField[]
}

/** 平台设置 schema（M6 填充完整；先立通用/更新两组骨架） */
export const SETTINGS_SCHEMA: SettingGroup[] = [
  {
    key: 'general',
    label: '通用',
    fields: [
      { key: 'launchAtLogin', label: '开机自动启动', type: 'boolean', default: true },
      { key: 'watchdog', label: '崩溃自动重启', type: 'boolean', default: true, description: '渲染进程/守护进程异常退出后自动恢复' },
      { key: 'locale', label: '界面语言', type: 'enum', default: 'zh-CN', options: [{ value: 'zh-CN', label: '简体中文' }, { value: 'en', label: 'English' }] },
    ],
  },
  {
    key: 'update',
    label: '更新',
    fields: [
      { key: 'updateChannel', label: '更新通道', type: 'enum', default: 'stable', options: [{ value: 'stable', label: '稳定版' }, { value: 'beta', label: '测试版' }] },
      { key: 'autoDistHotUpdate', label: '资源热更', type: 'boolean', default: true, description: '应用 dist 资源自动热更新，无需重启' },
      { key: 'kioskSilentUpdate', label: 'Kiosk 静默整包更新', type: 'boolean', default: true, hiddenInKiosk: false, description: '在锁屏时段安装整包更新' },
    ],
  },
]

export type SettingsValues = Record<string, Record<string, unknown>>
