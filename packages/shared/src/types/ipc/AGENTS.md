# IPC 平台域契约规范

本目录定义 `window.desktop` 平台域契约（`defineDomain` 单一真源：通道名、分组、三端类型全部自动推导）。
实现文件在 `packages/core/src/ipc/` 同名对应。新增或修改通道必须遵守以下约定。

## 命名

- 方法动词约定：
  - `list`：列表查询（永远返回数组）
  - `get`：单个查询或当前状态
  - `set` / `upsert`：写配置
  - `check` / `open` / `start` / `submit`：触发动作
  - `clear` / `remove` / `reset` / `close` / `stop`：破坏性操作（必须挂身份关卡）
  - `sync`：拉取当前快照（弹窗页面挂载时对账用）
- push 通道：全量快照一律 `updated` 后缀（如 `tabs.updated`）；一次性事件用动词过去式（如 `notification.received`）

## 参数

- 超过 1 个参数一律收对象参数；0-1 个原始值可直接传
- 身份字段（appId / tabId）禁止入参：Main 从 `event.sender` 反查身份；唯一例外是管理面"指定目标"参数（如 `cache.clear(appId)`）
- `deviceId`：多设备域必填；单设备域可省略（省略 = 唯一设备）

## 返回值

- 列表查询空数据返回 `[]`，不返回 `null` / `undefined`
- 单个查询找不到返回 `null`，不抛错、不返回特设联合类型
- 动作失败抛 `DesktopError`（统一错误通道）；禁止返回 `{ ok: boolean }` 包装或用 boolean 伪装成功
- 返回值必须可结构化克隆（IPC 序列化约束）

## 数据流：先拉后推

- 每个带 push 的域必须配套一个拉取口（`list` / `getState` / `sync`），页面先拉快照再订阅
- push 一律推全量快照，不做增量对账

## 身份与授权

- 调用者身份唯一来源是 `CallerResolver`（Main 创建窗口 / Web 容器时登记，Renderer 无法伪造），契约参数不携带身份
- 破坏性、管理面通道在实现第一行 `assertShell`；供业务页调用的能力域不设关卡
- 特例必须在契约注释里说明业务原因（如 `window.quit`：套壳业务页有合法退出入口，不设关卡）
