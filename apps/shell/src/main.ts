import { bootstrapAppearance, DiagnosticsApp, OverlayApp, registerEmbeddedApp, ShellApp } from '@shell/ui'
import { createApp, defineComponent, h } from 'vue'
import DemoTable from './demo/DemoTable.vue'
import '@shell/ui/styles.css'

// 挂载前同步应用启动外观：preload 已写 :root，此处补 system 模式的动态跟随
const boot = window.desktop?.shell.appearance()
if (boot) { bootstrapAppearance(boot.accent, boot.theme) }

/* platform-demo 演示应用：三个 embedded 业务页，仅当有对应 flavor 时才有意义，
   注册动作本身是渲染层职责（vue 组件不进主进程包）。 */
const DEMO_PAGES = [
  {
    route: '/demo/registration',
    title: '业务登记',
    columns: ['业务编号', '客户姓名', '业务类型', '办理状态', '受理时间'],
    rows: [
      ['YW-2026-0138', '张伟', '墓位选购', '已完成', '11-07 09:12'],
      ['YW-2026-0137', '李芳', '安葬服务', '办理中', '11-07 08:45'],
      ['YW-2026-0136', '王强', '续费管理', '待处理', '11-06 17:30'],
      ['YW-2026-0135', '陈静', '墓位选购', '已完成', '11-06 16:08'],
      ['YW-2026-0134', '刘洋', '碑文刻字', '办理中', '11-06 14:52'],
      ['YW-2026-0133', '赵敏', '安葬服务', '已完成', '11-06 11:20'],
      ['YW-2026-0132', '孙磊', '续费管理', '已完成', '11-05 15:40'],
    ],
    total: 76,
  },
  {
    route: '/demo/archive',
    title: '档案查询',
    columns: ['档案编号', '逝者姓名', '存放位置', '归档状态', '归档日期'],
    rows: [
      ['DA-2026-0421', '周建国', 'A 区 3 排 12', '已完成', '11-07 10:02'],
      ['DA-2026-0420', '吴秀英', 'B 区 1 排 08', '办理中', '11-07 09:33'],
      ['DA-2026-0419', '郑海', 'A 区 5 排 21', '待处理', '11-06 18:11'],
      ['DA-2026-0418', '冯丽', 'C 区 2 排 05', '已完成', '11-06 15:26'],
      ['DA-2026-0417', '蒋军', 'B 区 4 排 17', '已完成', '11-06 10:14'],
    ],
    total: 52,
  },
  {
    route: '/demo/devices',
    title: '设备台账',
    columns: ['设备编号', '设备名称', '所属区域', '运行状态', '最后巡检'],
    rows: [
      ['SB-001', '身份证读卡器', '1 号窗口', '已完成', '11-07 08:00'],
      ['SB-002', '高拍仪', '1 号窗口', '已完成', '11-07 08:00'],
      ['SB-003', '票据打印机', '2 号窗口', '办理中', '11-06 17:12'],
      ['SB-004', '签字板', '2 号窗口', '待处理', '11-05 09:40'],
      ['SB-005', '二维码扫描枪', '自助区', '已完成', '11-07 08:00'],
    ],
    total: 24,
  },
  {
    route: '/demo/testbed',
    title: '测试应用',
    columns: ['检查项', '预期', '实测', '结论', '时间'],
    rows: [
      ['应用打开', '侧边栏点击后出现 tab', '—', '待验', '—'],
      ['tab 关闭', '顶部关闭后回到空态', '—', '待验', '—'],
      ['事件流', 'shell.app-ready 后可见', '—', '待验', '—'],
      ['桥面调用', 'shell.info 返回版本', '—', '待验', '—'],
      ['窗口控制', '最小化/最大化/关闭可用', '—', '待验', '—'],
    ],
    total: 5,
  },
]

for (const page of DEMO_PAGES) {
  registerEmbeddedApp(page.route, defineComponent({
    name: `Demo_${page.route.split('/').pop()}`,
    render: () => h(DemoTable, page),
  }))
}

registerEmbeddedApp('/diagnostics', DiagnosticsApp)

/**
 * kiosk 看门狗恢复模式：连续崩溃后 WindowSystem 以 #/recovery 进入，
 * 渲染自检页而不是反复拉起——现场可读的故障态，而非黑屏/闪屏循环。
 */
function isRecoveryMode(): boolean {
  return window.location.hash === '#/recovery'
}

/** 原生浮层窗复用同一份 index.html：按 hash 区分形态，避免多入口产物 */
function isOverlayMode(): boolean {
  return window.location.hash.startsWith('#/overlay')
}

function mountRecovery() {
  createApp({
    render: () => h('div', {
      style: 'height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;background:#0d1117;color:#e6edf3;font-family:system-ui',
    }, [
      h('div', { style: 'font-size:40px' }, '⚠'),
      h('div', { style: 'font-size:18px;font-weight:600' }, '设备自检中'),
      h('div', { style: 'font-size:13px;color:#8b949e' }, '应用连续异常已进入恢复模式，请联系现场运维'),
      h('div', { style: 'font-size:12px;color:#6e7681' }, '重启终端可恢复 · 错误已上报'),
    ]),
  }).mount('#app')
  document.body.classList.add('ready')
}

if (isRecoveryMode()) {
  mountRecovery()
}
else if (isOverlayMode()) {
  // 浮层窗背景透明：splash 与 T4 首帧打点属于工作台，浮层只挂自己的 UI
  document.getElementById('splash')?.remove()
  document.body.style.background = 'transparent'
  document.documentElement.style.background = 'transparent'
  document.body.classList.add('ready')
  createApp(OverlayApp).mount('#app')
}
else {
  // 先让首帧（启动层 logo）真正绘制，再挂 Vue：重 bundle 的同步求值与挂载会把
  // 首帧推迟到自身结束之后——不先让路，窗口上屏直接就是应用界面（启动段被吞）。
  // 双 rAF 保证中间隔一次真实绘制；撤层双门闩见 index.html 内联脚本
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      createApp(ShellApp).mount('#app')
      requestAnimationFrame(() => {
        window.desktop?.markFirstPaint()
        window.dispatchEvent(new Event('shell-app-ready'))
      })
    })
  })
}
