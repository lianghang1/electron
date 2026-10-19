/** 更新流程状态（Main → Shell 推送负载，全量状态机） */
export interface UpdateState {
  status: 'idle' | 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error'
  /** 可用 / 已下载的新版本号 */
  version?: string
  /** 下载进度 0-100（downloading 时有效） */
  percent?: number
  /** 错误信息（error 时有效） */
  message?: string
}

/**
 * asar 热更新状态（Main → Shell 推送负载）：
 * pending = 已下载校验通过，重启应用后由引导器完成替换；
 * blocked = 发现热更版本但 minResourcesVersion 门槛未满足，等待整包更新先行
 * （与 idle 区分：现场可识别"没有更新"与"在等整包"）。
 */
export interface AsarUpdateState {
  status: 'idle' | 'checking' | 'downloading' | 'pending' | 'blocked' | 'error'
  /** 热更包版本号 */
  version?: string
  /** 下载进度 0-100（downloading 时有效） */
  percent?: number
  /** blocked 时有效：热更要求的最低 resources 版本 */
  minResourcesVersion?: string
  /** 错误信息（error 时有效） */
  message?: string
}

/**
 * asar 热更清单（`updates.asar` 指向的 JSON 或适配器 transform 的产出）：
 * 仅承载"取包"信息——版本号与热更包 zip 下载地址。
 * 校验元数据（asar 条目名 / sha256 / minResourcesVersion）内置于 zip 包内的
 * update.json 自描述下发，服务器只需提供返回 { version, url } 的判断接口与静态托管 zip。
 */
export interface UpdateManifest {
  version: string
  /** 热更包 zip 下载地址（相对清单地址解析，也可绝对地址），扩展名必须为 .zip */
  url: string
}

/**
 * 热更包 zip 内的自描述清单（update.json）：
 * 客户端下载 zip 后据此解包与校验，服务器侧无需维护任何校验元数据。
 */
export interface AsarBundleManifest {
  /** 热更版本号，须与外部清单 version 一致，不一致视为服务器配置错误 */
  version: string
  /** zip 内 asar 条目文件名（如 core-1.0.1.asar） */
  file: string
  /** zip 内 asar 条目的 sha256（hex 小写），解包后强校验，不一致即丢弃 */
  sha256: string
  /**
   * 可选：热更代码要求的最低 resources 版本（安装期整包版本）。
   * 热更只换代码不换 resources（厂商 DLL / 内置页面 / SumatraPDF），热更代码若依赖新版
   * resources 能力，发布时必须携带此字段；客户端发现本机 resources 旧于要求则拒绝应用该热更
   * （字段缺失 = 不设限，旧包天然兼容）。
   */
  minResourcesVersion?: string
}

/**
 * asar 热更源适配器：对接后端自定义的"判断接口"（响应格式由后端定）。
 * transform 把后端响应适配为内部清单 UpdateManifest——后端接口格式变化只改此函数
 * （位于 electron/main，随热更下发），core 的拉取 / 校验 / 指针链路零改动。
 * 不配置 transform = 响应即原生清单（version/url）。
 * 载荷约定：url 指向自描述 zip 包（内含 update.json + asar），校验元数据随包下发。
 */
export interface UpdateAsarSource {
  /** 判断接口地址（相对 updates.url 解析，也可绝对地址） */
  endpoint: string
  /** 请求方法（默认 GET） */
  method?: 'GET' | 'POST'
  /** 请求头（鉴权等） */
  headers?: Record<string, string>
  /** 请求体（method 为 POST 时随请求发送，如 JSON 表单） */
  body?: string
  /** 响应适配：后端响应 → 内部清单；缺省 = 响应即原生清单 */
  transform?: (raw: unknown) => UpdateManifest
}
