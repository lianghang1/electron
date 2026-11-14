import { createApp, computed, onMounted, ref, shallowRef, watch } from 'vue'
import { PANELS } from './catalog.js'
import { bridgeReal } from './jsapi.js'
import { store } from './store.js'
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
    const clock = ref('')
    const tick = () => {
      const d = new Date()
      const p = n => String(n).padStart(2, '0')
      clock.value = `${p(d.getFullYear())}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
    }
    tick()
    setInterval(tick, 1000)

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

    return { panels: PANELS, current, panelComp, loadError, logOpen, currentPanel, info, bridgeReal, logCount, clock, open }
  },
}

createApp(Root).mount('#app')
