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
 * pending = 已下载校验通过，重启应用后由引导器完成替换。
 */
export interface AsarUpdateState {
  status: 'idle' | 'checking' | 'downloading' | 'pending' | 'error'
  /** 热更包版本号 */
  version?: string
  /** 下载进度 0-100（downloading 时有效） */
  percent?: number
  /** 错误信息（error 时有效） */
  message?: string
}

/**
 * asar 热更清单（`updates.asar` 指向的 JSON）：
 * url 为应用代码包 app.asar（相对清单地址解析，也可绝对地址）。
 */
export interface UpdateManifest {
  version: string
  url: string
  /** asar 包 sha256（hex），下载后强校验，不一致即丢弃 */
  sha256: string
  /**
   * 可选：热更代码要求的最低 resources 版本（安装期整包版本）。
   * 热更只换代码不换 resources（厂商 DLL / 内置页面 / SumatraPDF），热更代码若依赖新版
   * resources 能力，发布时必须携带此字段；客户端发现本机 resources 旧于要求则拒绝应用该热更
   * （字段缺失 = 不设限，旧清单天然兼容）。
   */
  minResourcesVersion?: string
}

/**
 * asar 热更源适配器：对接后端自定义的"判断接口"（响应格式由后端定）。
 * transform 把后端响应适配为内部清单 UpdateManifest——后端接口格式变化只改此函数
 * （位于 electron/main，随热更下发），core 的拉取 / 校验 / 指针链路零改动。
 * 不配置 transform = 响应即原生清单（version/url/sha256）。
 * 载荷约定：url 指向的文件经 sha256 校验后，若是 zip 容器则解出其中的 asar，
 * 否则按 asar 直接使用（zip 只是传输容器，引导器只认 asar）。
 */
export interface UpdateAsarSource {
  /** 判断接口地址（相对 updates.url 解析，也可绝对地址） */
  endpoint: string
  /** 请求头（鉴权等，可选） */
  headers?: Record<string, string>
  /** 响应适配：后端响应 → 内部清单；缺省 = 响应即原生清单 */
  transform?: (raw: unknown) => UpdateManifest
}
