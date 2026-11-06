import type { AppInstance, AppManifest } from '@shell/shared'

/**
 * AppOpener SPI：平台只认识此接口，不认识任何具体形态。
 * 每种接入形态一个策略文件；新增形态 = 新增文件 + 组合根注册（平台零改动）。
 */
export interface AppOpener {
  readonly kind: string
  supports(entry: AppManifest['entry']): boolean
  open(manifest: AppManifest, instance: AppInstance): Promise<void>
  close(instance: AppInstance): Promise<void>
}

/** 运行中实例的容器句柄：各 opener 自行扩展（如 WebContentsView 引用） */
export interface AppInstanceHandle {
  [key: string]: unknown
}
