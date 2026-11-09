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
  // Vue 挂载完成即撤启动层（内联 splash 见 index.html），并回传 T4 首帧打点
  createApp(ShellApp).mount('#app')
  requestAnimationFrame(() => {
    document.body.classList.add('ready')
    window.desktop?.markFirstPaint()
  })
}
