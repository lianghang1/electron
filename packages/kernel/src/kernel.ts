import type { FlavorManifest } from '@shell/shared'
import type { LaunchMarks, Startable } from './lifecycle'
import { EventBus } from './event-bus'
import { createLaunchMarks } from './lifecycle'

/**
 * 平台内核上下文：组合根创建一次，各系统经构造函数接收。
 * 全仓库只有这里有权创建和接线系统对象（铁律一）。
 */
export interface KernelContext {
  flavor: FlavorManifest
  events: EventBus
  marks: LaunchMarks
}

export interface KernelSystem extends Startable {
  /** 依赖的系统名：启动序 = 拓扑序 */
  dependsOn?: readonly string[]
}

/**
 * PlatformKernel：创建即装配，start 按依赖序拉起，stop 逆序关闭。
 * 依赖目前只有 flavor + eventBus + marks——随里程碑逐个系统接入（window/apps/devices/update）。
 */
export interface PlatformKernel {
  ctx: KernelContext
  /** 注册后补系统：kernel 已启动则立即拉起，否则并入启动序（组合根解耦创建时序用） */
  register: (system: KernelSystem) => Promise<void>
  start: () => Promise<void>
  stop: () => Promise<void>
}

export function createKernel(flavor: FlavorManifest, systems: KernelSystem[] = []): PlatformKernel {
  const ctx: KernelContext = { flavor, events: new EventBus(), marks: createLaunchMarks() }

  const started: KernelSystem[] = []
  let bootCompleted = false

  async function startOne(system: KernelSystem): Promise<void> {
    await system.start()
    started.push(system)
  }

  async function start(): Promise<void> {
    for (const system of systems) { await startOne(system) }
    bootCompleted = true
    ctx.marks.t1KernelReady = Date.now()
  }

  async function register(system: KernelSystem): Promise<void> {
    if (bootCompleted) {
      await startOne(system)
      return
    }
    systems.push(system)
  }

  async function stop(): Promise<void> {
    for (const system of started.reverse()) { await system.stop().catch(() => {}) }
  }

  return { ctx, register, start, stop }
}
