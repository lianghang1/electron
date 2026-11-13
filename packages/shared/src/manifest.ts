import { z } from 'zod'

/**
 * 应用接入两形态（判别联合），统一 WebContentsView 宿主：
 * - local：仓库构建产物（resources/apps/<id>/，app:// 协议服务；开发态 devUrl 直连 dev server）
 * - remote：在线网页
 * 信任面与形态无关：桥面统一为零能力 JSAPI 受控桥，能调什么由 permissions 声明 + 路由层闸门判定。
 */
export const appEntrySchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('local'),
      /** 产物相对 resources/apps 的目录名，缺省 = appId；须为 kebab-case，杜绝路径穿越 */
      dir: z.string().regex(/^[a-z][a-z0-9-]*$/).optional(),
      /** 开发态覆盖：dev server 地址（pnpm dev 时本地应用直接加载，与 remote 同一条加载链） */
      devUrl: z.string().url().optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal('remote'),
      url: z.string().url(),
      /** 允许的页面 origin 白名单；空数组 = 拒绝所有 JSAPI 调用；'*' 显式表示全放行 */
      origins: z.array(z.string()),
    })
    .strict(),
])

export type AppEntry = z.infer<typeof appEntrySchema>

export const appManifestSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]*$/, 'appId 须为小写 kebab-case'),
  name: z.string().min(1),
  version: z.string(),
  entry: appEntrySchema,
  icon: z.string().optional(),
  /** 声明需要的硬件域（idcard/print/...），运行时经 PermissionService 放行 */
  devices: z.array(z.string()).default([]),
  /** 声明需要的平台权限 */
  permissions: z.array(z.string()).default([]),
  /** remote 页面窗口策略 */
  window: z
    .object({
      /** tab 栏是否显示关闭按钮（resource 形态固定 false） */
      closable: z.boolean().default(true),
    })
    .strict()
    .default({ closable: true }),
}).strict()

export type AppManifest = z.infer<typeof appManifestSchema>

/**
 * 产品形态（flavor）：一套壳 × N 个产品。
 * 品牌 + 内置应用清单 + 运行模式，全部是数据，零代码差异。
 */
export const flavorManifestSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]*$/),
  name: z.string().min(1),
  /** 运行模式：windowed = 窗口可调；kiosk = 全屏锁定 + 看门狗 */
  mode: z.enum(['windowed', 'kiosk']).default('windowed'),
  /** 启动直达的默认应用（须在 apps 清单内）；未配置 = 启动落空状态页 */
  defaultAppId: z.string().optional(),
  /**
   * 壳 chrome 档位：platform = tab 体系完整壳（多应用可切换）；
   * solo = 容器隐形（单应用直出、全屏 chrome 归零）。kiosk 运行模式强制 solo。
   */
  chrome: z.enum(['platform', 'solo']).default('platform'),
  /** 内置应用清单（apps.json 同构，也可远程下发） */
  apps: z.array(appManifestSchema).default([]),
  branding: z
    .object({
      icon: z.string().optional(),
      /** 启动页主色（与 dt token 同源的语义别名） */
      accent: z.string().default('#4f46e5'),
    })
    .strict()
    .default({ accent: '#4f46e5' }),
  update: z
    .object({
      /** 更新清单地址；空 = 禁用远程更新 */
      manifestUrl: z.string().url().optional(),
      /** 允许拉取清单与包的 origin 白名单 */
      allowedOrigins: z.array(z.string()).default([]),
    })
    .strict()
    .default({ allowedOrigins: [] }),
  print: z
    .object({
      /** 打印 URL 负载允许下载的 origin 白名单；'*' 放行全部公网（内网仍被 SSRF 防线拦截），空 = 拒绝一切远程下载 */
      urlOrigins: z.array(z.string()).default([]),
    })
    .strict()
    .default({ urlOrigins: [] }),
  /**
   * 运行韧性（无人值守形态如 kiosk 才配；未声明即全关）：
   * crashReload 仅窗口模式生效，kiosk 自带 relaunch 看门狗，两者互斥
   */
  resilience: z
    .object({
      /** 渲染进程崩溃自动重载，指数退避 + 滑动窗口熔断 */
      crashReload: z.boolean().default(false),
      /** 开机自启，仅打包态生效 */
      autoLaunch: z.boolean().default(false),
      /** 拦截用户发起的窗口关闭（Alt+F4 等），程序退出不受影响 */
      exitGuard: z.boolean().default(false),
      /** 每日定时重启，默认 03:00；动作按更新状态择优 */
      scheduledRestart: z
        .object({
          hour: z.number().int().min(0).max(23).default(3),
          minute: z.number().int().min(0).max(59).default(0),
        })
        .strict()
        .optional(),
    })
    .strict()
    .optional(),
}).strict()

export type FlavorManifest = z.infer<typeof flavorManifestSchema>

/** 壳 chrome 档位生效值：kiosk 运行模式强制 solo（全屏锁定形态没有工作台 chrome） */
export function effectiveChrome(flavor: Pick<FlavorManifest, 'mode' | 'chrome'>): 'platform' | 'solo' {
  return flavor.mode === 'kiosk' ? 'solo' : flavor.chrome
}

/** 应用注册来源 */
export type AppSource = 'flavor' | 'apps.json' | 'remote'

export interface RegisteredApp {
  manifest: AppManifest
  source: AppSource
}

/** 运行中 App 实例：opening → opened → closing → closed */
export interface AppInstance {
  instanceId: string
  appId: string
  state: 'opening' | 'opened' | 'closing' | 'closed'
  createdAt: number
  /** opener 挂载的运行时句柄（WebContentsView 引用等） */
  handle: Record<string, unknown>
}
