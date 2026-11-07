import { z } from 'zod'

/**
 * 应用接入三形态（判别联合）：
 * - embedded：嵌入工作台的融合页（shell 路由组件，零桥接开销）
 * - packaged：打包好的 dist（resources/apps/<id>/，app:// 协议服务）
 * - remote：在线网页（WebContentsView + JSAPI 受控桥）
 */
export const appEntrySchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('embedded'),
    /** shell 内路由路径，如 '/devices' */
    route: z.string().startsWith('/'),
  }),
  z.object({
    kind: z.literal('packaged'),
    /** 相对 resources/apps 的目录名，缺省 = appId */
    dir: z.string().optional(),
  }),
  z.object({
    kind: z.literal('remote'),
    url: z.string().url(),
    /** 允许的页面 origin 白名单；空数组 = 拒绝所有 JSAPI 调用 */
    origins: z.array(z.string()),
  }),
])

export type AppEntry = z.infer<typeof appEntrySchema>

export const appManifestSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]*$/, 'appId 须为小写 kebab-case'),
  name: z.string().min(1),
  version: z.string(),
  /** internal：平台自己人；third-party：外部接入方，按更严格策略处理 */
  type: z.enum(['internal', 'third-party']).default('internal'),
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
    .default({ closable: true }),
})

export type AppManifest = z.infer<typeof appManifestSchema>

/**
 * 产品形态（flavor）：一套壳 × N 个产品。
 * 品牌 + 内置应用清单 + 运行模式，全部是数据，零代码差异。
 */
export const flavorManifestSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]*$/),
  name: z.string().min(1),
  /** 运行模式：desktop = 窗口可调；kiosk = 全屏锁定 + 看门狗 */
  mode: z.enum(['desktop', 'kiosk']).default('desktop'),
  /** 启动直达的默认应用（须在 apps 清单内）；未配置 = 启动落空状态页 */
  defaultAppId: z.string().optional(),
  /** 内置应用清单（apps.json 同构，也可远程下发） */
  apps: z.array(appManifestSchema).default([]),
  branding: z
    .object({
      icon: z.string().optional(),
      /** 启动页主色（与 dt token 同源的语义别名） */
      accent: z.string().default('#2f81f7'),
    })
    .default({ accent: '#2f81f7' }),
  update: z
    .object({
      /** 更新清单地址；空 = 禁用远程更新 */
      manifestUrl: z.string().url().optional(),
      /** 允许拉取清单与包的 origin 白名单 */
      allowedOrigins: z.array(z.string()).default([]),
    })
    .default({ allowedOrigins: [] }),
})

export type FlavorManifest = z.infer<typeof flavorManifestSchema>

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
