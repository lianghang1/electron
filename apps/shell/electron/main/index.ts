import type { FlavorManifest } from '@shell/shared'
import { join } from 'node:path'
import process from 'node:process'
import { z } from 'zod'
import { AppService } from '@shell/app-runtime'
import { createKernel, type KernelSystem } from '@shell/kernel'
import { WindowSystem } from '@shell/window'
import { UpdateCenter } from '@shell/update'

/**
 * 组合根：全仓库唯一的组装现场（铁律一）。
 * 读本文件 = 读产品目录；除此之外任何模块不得创建跨系统对象。
 */
const flavorSchema = z.object({
  id: z.string(),
  name: z.string(),
  mode: z.enum(['desktop', 'kiosk']).default('desktop'),
  apps: z.array(z.unknown()).default([]),
  branding: z.any().default({}),
  update: z.any().default({}),
})

function loadFlavor(): FlavorManifest {
  // --flavor=<id> 指向 apps/flavors/<id>/flavor.json；缺省 cemetery
  const flavorArg = process.argv.find(a => a.startsWith('--flavor='))
  const flavorId = flavorArg?.split('=')[1] ?? 'cemetery'
  const flavorPath = join(process.cwd(), '../../apps/flavors', flavorId, 'flavor.json')
  // eslint-disable-next-line ts/no-require-imports
  const raw = require(flavorPath) as unknown
  return flavorSchema.parse(raw) as FlavorManifest
}

async function main(): Promise<void> {
  const flavor = loadFlavor()

  const windows = new WindowSystem(flavor, join(__dirname, '../renderer'))
  const apps = new AppService(() => true)

  const systems: KernelSystem[] = [apps, windows, new UpdateCenter([])]
  const kernel = createKernel(flavor, systems)

  // flavor 清单注册进应用运行时
  for (const app of flavor.apps)
    apps.register(app as never, 'flavor')

  await kernel.start()

  windows.createShellWindow()
  kernel.ctx.marks.t3WindowShown = Date.now()
}

void main()
