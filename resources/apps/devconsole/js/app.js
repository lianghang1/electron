import { createApp, computed, onMounted, ref, shallowRef, watch } from 'vue'
import { PANELS } from './catalog.js'
import { bridgeReal } from './jsapi.js'
import { store, fmtTime, runRefreshers } from './store.js'
import LogView from './components/log-view.js'

/**
 * 应用根：hash 路由 + 面板流水线（fetch 模板 HTML 作 template → import 面板逻辑模块 →
 * 动态组件挂载）。面板组件随切换自动走 mounted/unmounted，设备类面板在 unmount 里回收。
 */
const Root = {
  components: { LogView },
  setup() {
    const hashId = () => (/^#\/([\w-]+)/.exec(location.hash)?.[1] ?? 'overview')
    const current = ref(hashId())
    const panelComp = shallowRef(null)
    const loadError = ref('')
    const logOpen = ref(true)
    const currentPanel = computed(() => PANELS.find(p => p.id === current.value))
    const info = computed(() => store.info)
    const logCount = computed(() => store.logs.length)
    const updatedAt = computed(() => store.updatedAt)

    // 全局「刷新设备」：逐面板登记的枚举刷新并发跑一遍，完成后盖时间戳
    async function refreshDevices() {
      await runRefreshers()
      store.updatedAt = `更新于 ${fmtTime(Date.now())}`
    }
    const clock = ref('')
    // 会话号：进程本次启动生成（参考 HDC 控制台的会话标识），仅用于日志/截图对账
    const sessionId = `LOCAL-${String(new Date().getMinutes() % 8 + 1).padStart(2, '0')}`
    const tick = () => {
      const d = new Date()
      const p = n => String(n).padStart(2, '0')
      clock.value = `${p(d.getFullYear())}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
    }
    tick()
    setInterval(tick, 1000)

    // F1-F9 直切模块、ESC 收起/展开流水：调试台键盘操作语义
    function onKey(e) {
      const fn = /^F([1-9])$/.exec(e.key)
      if (fn) {
        e.preventDefault()
        const target = PANELS[Number(fn[1]) - 1]
        if (target) { open(target.id) }
        return
      }
      if (e.key === 'Escape') { logOpen.value = !logOpen.value }
    }
    window.addEventListener('keydown', onKey)

    async function load(id) {
      loadError.value = ''
      panelComp.value = null
      try {
        const [mod, template] = await Promise.all([
          import(`../panels/${id}.js`),
          fetch(`panels/${id}.html`).then((r) => {
            if (!r.ok) { throw new Error(`panels/${id}.html ${r.status}`) }
            return r.text()
          }),
        ])
        mod.default.template = template
        panelComp.value = mod.default
      }
      catch (err) {
        loadError.value = String(err?.message ?? err)
      }
    }

    function open(id) { location.hash = `#/${id}` }
    window.addEventListener('hashchange', () => { current.value = hashId() })
    watch(current, load)
    onMounted(() => { load(current.value) })

    return { panels: PANELS, current, panelComp, loadError, logOpen, currentPanel, info, bridgeReal, logCount, clock, sessionId, updatedAt, refreshDevices, open }
  },
}

createApp(Root).mount('#app')
