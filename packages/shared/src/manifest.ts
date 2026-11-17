import { z } from 'zod'

/**
 * 应用接入两形态（判别联合），统一 WebContentsView 宿主。
 * 信任面与形态无关：桥面统一为零能力 JSAPI 受控桥，能调什么由 permissions 声明 + 路由层闸门判定。
 * 字段说明一律写进 describe()：JSON Schema 悬停文档与 zod 报错共用同一份文字，注释不另立事实源。
 */
export const appEntrySchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('local').describe('本地应用：仓库构建产物经 app:// 协议服务（app 本地应用）'),
      dir: z
        .string()
        .regex(/^[a-z][a-z0-9-]*$/, '目录名须为小写 kebab-case')
        .optional()
        .describe('产物相对 resources/apps 的目录名，缺省 = appId；kebab-case 杜绝路径穿越'),
      devUrl: z
        .string()
        .url()
        .optional()
        .describe('开发态覆盖：dev server 地址（pnpm dev 时本地应用直接加载，与 remote 同一条加载链）'),
    })
    .strict(),
  z
    .object({
      kind: z.literal('remote').describe('远程应用：在线网页（origin 白名单 + 受管弹窗）'),
      url: z.string().url().describe('应用入口地址'),
      origins: z
        .array(z.string())
        .describe('允许的页面 origin 白名单；空数组 = 拒绝所有 JSAPI 调用；"*" 显式表示全放行'),
    })
    .strict(),
])

export type AppEntry = z.infer<typeof appEntrySchema>

export const appManifestSchema = z.object({
  id: z
    .string()
    .regex(/^[a-z][a-z0-9-]*$/, 'appId 须为小写 kebab-case')
    .describe('应用唯一标识（kebab-case）：tab 键、资源目录、IPC 身份都用它'),
  name: z.string().min(1).describe('显示名称（tab 栏、应用中心、加载垫场）'),
  version: z.string().describe('应用版本号，仅作标记'),
  entry: appEntrySchema.describe('接入形态：local（本地产物）或 remote（在线网页）'),
  icon: z.string().optional().describe('图标文件相对应用目录的路径；缺省用名称首字徽标'),
  devices: z.array(z.string()).default([]).describe('声明需要的硬件域（idcard/print/...），运行时经 PermissionService 放行'),
  permissions: z.array(z.string()).default([]).describe('声明需要的平台权限（JSAPI 白名单，空 = 该应用零桥面能力）'),
  window: z
    .object({
      closable: z.boolean().default(true).describe('tab 栏是否显示关闭按钮（resource 形态固定 false）'),
    })
    .strict()
    .default({ closable: true })
    .describe('remote 页面窗口策略'),
}).strict()

export type AppManifest = z.infer<typeof appManifestSchema>

/**
 * 产品形态（flavor）：一套壳 × N 个产品。
 * 品牌 + 内置应用清单 + 运行模式，全部是数据，零代码差异。
 */
export const flavorManifestSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]*$/, 'flavor id 须为小写 kebab-case').describe('产品形态唯一标识（kebab-case），对应 apps/flavors/<id>/ 目录'),
  name: z.string().min(1).describe('产品形态显示名称'),
  mode: z.enum(['windowed', 'kiosk']).default('windowed').describe('运行模式：windowed = 窗口可调；kiosk = 全屏锁定 + 看门狗自愈'),
  chrome: z
    .enum(['platform', 'solo'])
    .default('platform')
    .describe('壳 chrome 档位：platform = tab 体系完整壳（多应用可切换）；solo = 容器隐形（单应用直出）。kiosk 运行模式强制 solo'),
  apps: z.array(appManifestSchema).default([]).describe('内置应用清单（apps.json 同构，也可远程下发）'),
  branding: z
    .object({
      icon: z.string().optional().describe('品牌图标路径（托盘等复用）；缺省用内建 logo'),
      accent: z.string().default('#4f46e5').describe('品牌主色（hex）：启动页、加载垫场 spinner 前景色、语义 accent 别名'),
    })
    .strict()
    .default({ accent: '#4f46e5' })
    .describe('品牌外观'),
  update: z
    .object({
      manifestUrl: z.string().url().optional().describe('更新清单地址；不填 = 禁用远程更新'),
      allowedOrigins: z.array(z.string()).default([]).describe('允许拉取更新清单与安装包的 origin 白名单'),
    })
    .strict()
    .default({ allowedOrigins: [] })
    .describe('整包更新通道'),
  print: z
    .object({
      urlOrigins: z
        .array(z.string())
        .default([])
        .describe('打印 URL 负载允许下载的 origin 白名单；"*" 放行全部公网（内网仍被 SSRF 防线拦截），空 = 拒绝一切远程下载'),
    })
    .strict()
    .default({ urlOrigins: [] })
    .describe('打印能力'),
  resilience: z
    .object({
      crashReload: z.boolean().default(false).describe('渲染进程崩溃自动重载，指数退避 + 滑动窗口熔断；仅窗口模式生效（kiosk 自带看门狗，互斥）'),
      autoLaunch: z.boolean().default(false).describe('开机自启，仅打包态生效'),
      exitGuard: z.boolean().default(false).describe('拦截用户发起的窗口关闭（Alt+F4 等），程序退出不受影响'),
      scheduledRestart: z
        .object({
          hour: z.number().int().min(0).max(23).default(3).describe('每日定时重启的小时（0-23）'),
          minute: z.number().int().min(0).max(59).default(0).describe('每日定时重启的分钟（0-59）'),
        })
        .strict()
        .optional()
        .describe('每日定时重启，缺省 03:00；动作按更新状态择优'),
    })
    .strict()
    .optional()
    .describe('运行韧性（无人值守形态才配；整段不写 = 全关）'),
}).strict()

export type FlavorManifest = z.infer<typeof flavorManifestSchema>

/**
 * flavor.json 统一解析入口：剥掉 IDE 关联的 $schema 元键（strict 契约拒绝未知键）再 zod 校验。
 * dev 装配、打包校验、schema 生成脚本三处共用，保证只有一个事实源。
 */
export function parseFlavorManifest(json: unknown): FlavorManifest {
  const { $schema: _schema, ...rest } = (typeof json === 'object' && json !== null ? json : {}) as Record<string, unknown>
  void _schema
  return flavorManifestSchema.parse(rest)
}

/** flavor.json 的 JSON Schema（IDE 补全/必填/枚举/悬停文档的数据源），scripts/gen-flavor-schema.mjs 消费 */
export function flavorJsonSchema(): Record<string, unknown> {
  return z.toJSONSchema(flavorManifestSchema, { target: 'draft-2020-12', io: 'input' })
}

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
