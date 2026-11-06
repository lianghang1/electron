/**
 * @shell/devices 对外出口：组合根只从这里拿设备网关与域路由。
 * 域内部实现（domains/ host/）不经此暴露——跨包只能走这里（铁律三）。
 */
export { createDeviceGateway, createDomainRouter, DomainRouteError } from './gateway'
export type { DeviceGateway, DeviceGatewayOptions, DomainRouter } from './gateway'
