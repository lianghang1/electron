/* 启动层双门闩：logo 动画播完（或 1s 兜底）且应用挂载完成，两个条件都满足才淡出。
   有意不做「挂载超时兜底撤层」：应用挂载失败时宁可停在 logo（运维能看出异常），
   也不露出无提示的破碎白屏。
   经 index.html 以 type=module 引入：module 按文档序执行，本脚本先于 main.ts
   挂好监听；命名避开 window.shell（contextBridge 不可配置全局，同名声明会
   在解析期抛 SyntaxError）。 */
;(() => {
  const splash = document.getElementById('splash')
  // 局部名不能叫 shell：桥面经 contextBridge 暴露的 window.shell 是不可配置全局属性，
  // 全局词法声明与之同名会在整段脚本解析期抛 SyntaxError，启动层两门闩全部失效
  const logoShell = document.querySelector('.startup-logo-shell')
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  // logo 最短驻留：即使动画与挂载都已就绪，也要保证弹出段+驻留在屏幕上完整呈现
  const MIN_SPLASH_MS = 600
  let finished = false
  let animationDone = false
  let appReady = false
  let introStartedAt = 0
  // 握手门闩：主进程声明 solo 直出（--shell-intro-gate=app）时，撤层还要等
  // 首应用开好（shell-app-opened），否则撤层瞬间先闪工作台底色再切应用，破坏启动单色；
  // 无直出场景（platform / 清单不恰一个）不引入第三个门闩
  const introGateApp = (() => {
    try { return window.shell?.shell?.appearance?.()?.introGate === 'app' }
    catch { return false }
  })()
  let contentReady = !introGateApp

  function tryFinish() {
    if (finished || !animationDone || !appReady || !contentReady || !splash) { return }
    if (!introStartedAt || Date.now() - introStartedAt < MIN_SPLASH_MS) { return }
    finished = true
    document.body.classList.add('ready')
    window.setTimeout(() => splash.remove(), 500)
  }

  function markAnimationDone() {
    animationDone = true
    tryFinish()
  }

  function markAppReady() {
    appReady = true
    tryFinish()
  }

  // 应用侧（工作台页）在 Vue 挂载 + 首帧 rAF 后派发
  window.addEventListener('shell-app-ready', markAppReady, { once: true })
  window.addEventListener('shell-app-opened', () => {
    contentReady = true
    tryFinish()
  }, { once: true })

  // 一切计时与动画统一以「主进程确认首帧已绘」为起点（shell:introBegin 推送）。
  // 窗口上屏时机只有主进程知道：渲染层 visibilityState 在壳窗口（禁用 Win 遮罩
  // 计算）下从加载起恒为 visible，若据它起播，动画会在窗口上屏前被整段消耗——
  // 上屏即应用界面，这正是「启动动画有时显示不出来」的根因。
  function beginIntro() {
    if (introStartedAt) {
      tryFinish()
      return
    }
    introStartedAt = Date.now()
    if (reduceMotion || !logoShell) {
      markAnimationDone()
    }
    else {
      logoShell.addEventListener('animationend', markAnimationDone, { once: true })
      logoShell.style.animationPlayState = 'running'
      window.setTimeout(markAnimationDone, 1000)
    }
    // 最短驻留到期后复核撤层：门闩条件可能早已全部满足，只差驻留时长
    window.setTimeout(tryFinish, MIN_SPLASH_MS)
  }

  const bridge = window.shell?.shell
  if (typeof bridge?.onIntroBegin === 'function') {
    bridge.onIntroBegin(beginIntro)
  }
  else {
    // 桥缺失（纯浏览器预览等）：退回 visibility 信号
    if (document.visibilityState === 'visible') { beginIntro() }
    else {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') { beginIntro() }
      }, { once: true })
    }
  }
})()
