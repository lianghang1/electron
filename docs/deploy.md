# 部署手册

## 部署形态

| 形态 | 应用 | 安装方式 | 运行特征 |
|---|---|---|---|
| 平台 Shell | @app/desktop | NSIS 分步向导（`Desktop-<版本>-x64.exe`） | 常驻桌面，窗口关闭被 exitGuard 拦截 |
| 自助一体机 | @app/funeral-kiosk | NSIS 一键安装（`FuneralKiosk-Setup-<版本>.exe`，双击即装完） | 全屏 kiosk、开机自启、防退出、每日 3:00 定时重启 |

两种形态均默认**仅当前用户安装**（`%LocalAppData%\Programs\<产品名>`），安装与更新全程零 UAC。

## 更新服务器接入

1. 服务器侧要求见 [`update-server.md`](./update-server.md)（feed 目录结构、清单协议、版本纪律）。
2. 客户端通过环境变量 **`DESKTOP_UPDATE_FEED`** 指向 feed 基地址（如 `https://updates.xxx.com/<app>`）。
   **未设置时两条更新通道全部禁用**（安装包内烘焙的 publish url 仅是占位，不生效）。
3. 设置方式（部署侧二选一）：
   - 系统级环境变量（`setx DESKTOP_UPDATE_FEED <url>` 后重新登录生效，对所有进程可见）
   - 自启动脚本内注入（kiosk 无人值守常用）：启动 exe 前设置进程环境变量
4. 验证：应用启动后检查 `%APPDATA%\<产品名>\logs\main.log` 是否出现更新检查记录；
   热更链路产物在 `%APPDATA%\<产品名>\desktop-updater\`。

## 设备资源（厂商 DLL / 打印组件）

- 设备驱动文件**单一来源在仓库根 `resources/devices/`**（与消费它们的 `packages/core` 驱动代码同仓演进）。
- 各应用目录下的 `resources/devices` 是 postinstall 自动**单向复制**的产物（`pnpm sync:resources` 可手动重建）：
  根目录是唯一真源，应用侧是再生成的普通目录。**不要往应用侧放文件**——手工添加的内容会在下次同步时
  丢失（同步脚本会大声警告）。
- 设备资源更新 = 更新仓库根 `resources/devices/` 下的文件 → 随**整包更新**发布（热更不带 resources，
  热更代码依赖新版驱动能力时用 `pnpm hotfix --min-resources-version` 做配对保护）。

## 目录速查（安装后）

```
%LocalAppData%\Programs\<产品名>\        ← 安装目录（exe / resources 含设备驱动）
%APPDATA%\<产品名>\                      ← userData
├── desktop-updater\                     ← asar 热更工作区（core-*.asar / current.json / launcher.log）
├── storage\                             ← electron-store 数据
├── logs\main.log                        ← electron-log 主进程日志
└── capture\                             ← 高拍仪等采集落盘
%LocalAppData%\@app<slug>-updater\       ← electron-updater 整包下载缓存
```

## 排查入口

- 引导器（内置包/热更包加载、回滚）：`%APPDATA%\<产品名>\desktop-updater\launcher.log`
- 主进程业务日志：`%APPDATA%\<产品名>\logs\main.log`
- 设备状态：应用内设备测试页（lab）或渲染桥 `window.desktop.capture.listDevices()`
- 更新卡住的常见原因：feed 未设置（环境变量）、清单被 CDN 缓存（要求 `Cache-Control: no-cache`）、
  版本号未严格递增
