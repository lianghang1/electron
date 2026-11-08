import type { PlatformCapability } from '@shell/shared'

export type DriverDeployment = PlatformCapability['driverDeployment']

/**
 * 驱动资产寻址 SPI：域内 DLL 声明是逻辑路径 devices/<域>/<厂商>/<平台>/<文件>，
 * 「逻辑路径 → 运行时绝对路径」由按平台部署方式装配的策略决定（铁律二）。
 * 域内部只认 assetRoot + 声明，零感知 dev / 打包 / 现场部署差异。
 *
 * 平台差异收敛为数据表：组合根查 PLATFORM_CAPABILITIES 得 driverDeployment，
 * 再查 RESOLVERS 表创建唯一策略并注入；平台代码里零 switch、零 process.platform 分支。
 */
export interface DriverResolver {
  readonly deployment: DriverDeployment
  /** 逻辑声明相对根；域内部 join(assetRoot, declared) 得绝对路径 */
  readonly assetRoot: string
  /** 该平台是否携带驱动资产（system 部署 = 系统自带，无随包资产） */
  readonly carriesAssets: boolean
  /** 逻辑声明 → 绝对路径 */
  resolve: (declared: string) => string
  /** 声明的文件在运行时是否就位（未就位时设备域降级为 unavailable，不抛错） */
  present: (declared: string) => boolean
}
