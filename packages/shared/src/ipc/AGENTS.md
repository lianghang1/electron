# 壳设施 IPC 域契约规范

本目录定义 `window.desktop` 壳设施桥面契约（`defineIpcDomain` 单一真源：通道名、分组、三端类型全部自动推导）。
主进程注册实现在 `apps/shell/electron/main/index.ts` 与 `packages/window`（经 `shellHandle` 统一注册）；
`packages/kernel` settings 服务经注入的 ipc 接口注册（字面量与契约派生名同形）。
新增或修改通道必须遵守以下约定。

## 通道形态（签名桩即形态）

- `invoke<(...args) => result>` → `shellHandle` 注册 / 渲染层 Promise 方法，请求-响应
- `send<(...args) => void>` → `shellOn` 注册 / 渲染层 fire-and-forget（高频或无回执场景）
- `push<[...args]>` → `webContents.send` 推送 / 渲染层 `onXxx` 订阅

## 命名

- 方法动词约定：
  - `list`：列表查询（永远返回数组）
  - `get` / `snapshot` / `state`：单个查询或当前状态
  - `set` / `apply` / `upsert`：写配置
  - `open` / `start` / `submit` / `reset`：触发动作
  - `clear` / `remove` / `dismiss` / `close` / `stop`：破坏性操作（主进程第一行挂身份关卡）
  - `sync`：拉取当前快照（弹窗页面挂载时对账用）
- push 通道：全量快照一律 `updated` 后缀（如 `overlay:updated`）；一次性事件用动词过去式
- 通道名自动派生 `${domain}:${camelMethod}`；`packages/kernel` settings 服务的既有注册
  字面量必须与派生名保持同形，禁止在契约外另起通道名

## 参数

- 超过 1 个参数一律收对象参数；0-1 个原始值可直接传
- 身份字段（appId / instanceId）禁止入参：Main 从 `event.sender` 反查身份；唯一例外是
  管理面「指定目标」参数（如 `sessions.clearCache(appId)`）
- `deviceId`：多设备域必填；单设备域可省略（省略 = 唯一设备）

## 返回值

- 列表查询空数据返回 `[]`，不返回 `null` / `undefined`
- 单个查询找不到返回 `null`，不抛错、不返回特设联合类型
- 动作失败抛带 code 的错误（经 shellHandle 统一编码过桥，渲染层还原 IpcRemoteError）；
  禁止返回 `{ ok: boolean }` 包装或用 boolean 伪装成功
- 返回值必须可结构化克隆（IPC 序列化约束）；运行时句柄（WebContentsView 引用等）只出投影

## 数据流：先拉后推

- 每个带 push 的域必须配套一个拉取口（`sync` / `state`），页面先拉快照再订阅
- push 一律推全量快照，不做增量对账

## 身份与授权

- 调用者身份唯一来源是 CallerResolver（Main 创建窗口 / Web 容器时登记，Renderer 无法伪造），
  契约参数不携带身份
- 破坏性、管理面通道在实现第一行挂身份关卡（`callerOf` / `authorized` / `assertRegisteredApp`）；
  供业务页调用的能力域不设关卡；特例必须在契约注释里说明业务原因

## 新增能力域 checklist

1. `domains/` 新建契约文件（`defineIpcDomain` 声明签名 + 业务注释）
2. `index.ts` 的 `shellDomains` 并集加一行
3. 主进程在组合根用 `shellHandle('domain:method', handler)` / `shellOn` 注册
4. 渲染层即刻获得 `desktop().domain.method()` 类型化调用，零桥面改动

以上约束由 guard 的 `ipc/*` 规则族强制执行：契约声明了但漏注册（`ipc/unregistered-channel`）、
注册了契约外通道（`ipc/foreign-channel`）、契约外字面量 `ipcMain.handle/on`（`ipc/literal-registration`）。
有意游离于契约外的基础设施通道（如 `domain-call`、`jsapi:call`）必须在
`scripts/guardrails/guard.mjs` 的 `IPC_REGISTRATION_ALLOW` 白名单逐通道登记并注明理由。
