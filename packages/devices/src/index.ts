export { detectDevicePlatform } from './domains/platform'
export type { DevicePlatform, DevicePlatformId } from './domains/platform'
export {
  BundledDriverResolver,
  createDriverResolver,
  ManualDriverResolver,
  PLATFORM_CAPABILITIES,
  resolvePlatformCapability,
  SystemDriverResolver,
} from './drivers'
export type { DriverDeployment, DriverResolver, DriverRoots, PlatformCapability } from './drivers'
/**
 * @shell/devices 对外出口：组合根只从这里拿设备网关、域路由与驱动寻址能力。
 * 域内部实现（domains/ host/）不经此暴露——跨包只能走这里。
 */
export { createDeviceGateway, createDomainRouter, DomainRouteError } from './gateway'
export type { DeviceGateway, DeviceGatewayOptions, DomainRouter } from './gateway'
export { collectAssetDeclarations, collectAssetSources } from './host/asset-audit'
