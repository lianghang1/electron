# 回归探针

对 dev 模式运行中的桌面应用做运行时行为回归（CDP 9222）。每个探针自带前置（激活主窗 / 打开 lab / 权限复位），可重复执行。

## 运行

```bash
pnpm dev                        # 前置：任一终端启动 desktop Shell（CDP 9222）
node scripts/probe/dialog.mjs   # 运行时授权弹窗全闭环（出现/倒计时/拒绝/重现/移除）
node scripts/probe/download.mjs # 下载通知卡（逐条卡片/进度/终态/× 关闭/TTL）
node scripts/probe/menu.mjs     # Tab 右键菜单浮层窗（出现/文案/刷新动作/ESC/外点关闭）
node scripts/probe/exit.mjs     # 优雅退出（close → 进程退出）
```

退出码 = 失败数（0 = 全过），可直接接 CI。

## 辅助工具

| 工具 | 用途 |
| --- | --- |
| `reset-perms.mjs` | 单独复位 lab 全部运行时权限决策（历史「允许」持久化会让弹窗不再出现——测试副作用） |
| `move-front.mjs` | 打破窗口遮挡：全屏浮层窗打开期间主窗被遮挡，Chromium 遮挡检测使 `visibilityState=hidden`，该值是环境噪声（视觉无影响），断言勿依赖 |

## 约定

- 探针只覆盖运行时行为；纯逻辑（契约校验/注册/权限服务）走 `pnpm test`（core vitest）
- 新增探针复用 `_lib.mjs`（连接 / 求值 / 断言计数 / 前置），不要复制样板
- 探针收尾要保持环境干净：会持久化的决策用「拒绝」路径收尾
