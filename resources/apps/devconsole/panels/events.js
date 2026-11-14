import { computed, defineAsyncComponent, defineComponent, onUnmounted, reactive, ref } from 'vue'
import { DEVICE_EVENT_NAMES } from '../js/catalog.js'
import { bridgeReal, call, onDeviceEvent } from '../js/jsapi.js'
import { pushEvent, store } from '../js/store.js'

/**
 * 事件流：受控桥白名单事件（capture.frame / scanner.scanned / signature.stroke / devices.ready）
 * 的订阅开关与流水。capture.frame 高频帧只计数 + 留最近一帧。
 */
export default defineComponent({
  name: 'EventsPanel',
  setup() {
    const unsubscribes = {}
    const listening = reactive({})
    const counts = reactive({})
    const lastPayload = reactive({})
    const probeReady = ref(null)

    for (const name of DEVICE_EVENT_NAMES) { counts[name] = 0 }

    function toggle(name) {
      if (unsubscribes[name]) {
        unsubscribes[name]()
        delete unsubscribes[name]
        listening[name] = false
        return
      }
      unsubscribes[name] = onDeviceEvent(name, (payload) => {
        counts[name]++
        lastPayload[name] = payload
        pushEvent(name, payload)
      })
      listening[name] = true
    }

    onUnmounted(() => {
      for (const name of Object.keys(unsubscribes)) {
        unsubscribes[name]()
        delete unsubscribes[name]
        listening[name] = false
      }
    })

    /** 模拟桥下手动产生事件（真实桥置灰，用真设备产生） */
    function fire(name) {
      const payload = mockPayload(name)
      counts[name]++
      lastPayload[name] = payload
      pushEvent(name, payload)
    }

    function mockPayload(name) {
      switch (name) {
        case 'capture.frame': return { deviceId: 'capture-demo-1', frame: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAJUlEQVR4nGP8z8Dwn4GBgYGJgYGB4T8DAwMrw6gMxkC6cAImAHmUBCZ1p/6yAAAAAElFTkSuQmCC' }
        case 'scanner.scanned': return { code: `MOCK-${Math.random().toString(36).slice(2, 10)}` }
        case 'signature.stroke': return { point: { x: 120, y: 80, pressure: 0.7, phase: 'move' } }
        case 'devices.ready': return {}
        default: return {}
      }
    }

    async function probe() {
      probeReady.value = await call('info.get')
    }

    const eventRows = computed(() => DEVICE_EVENT_NAMES.map(name => ({
      name,
      listening: Boolean(listening[name]),
      count: counts[name],
      last: lastPayload[name],
    })))

    const summarize = (payload) => {
      if (payload == null) { return '—' }
      const text = JSON.stringify(payload)
      return text.length > 120 ? `${text.slice(0, 120)}…` : text
    }

    return { eventRows, store, bridgeReal, probeReady, toggle, fire, probe, summarize }
  },
})
