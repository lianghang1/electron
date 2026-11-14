import { defineAsyncComponent, defineComponent, onUnmounted, ref } from 'vue'
import { CATALOG } from '../js/catalog.js'
import { bridgeReal, call, emitMockEvent, onDeviceEvent } from '../js/jsapi.js'
import { pushEvent } from '../js/store.js'

/** 扫码枪：配置读写 + scanner.scanned 事件流 + 演示注入。离开面板退订事件。 */
export default defineComponent({
  name: 'ScannerPanel',
  components: { InvokeForm: defineAsyncComponent(() => import('../js/components/invoke-form.js').then(m => m.default)), DeviceList: defineAsyncComponent(() => import('../js/components/device-list.js').then(m => m.default)) },
  setup() {
    const config = ref(null)
    const scans = ref([])
    const listening = ref(false)

    const setConfigDef = CATALOG.scanner.methods.setConfig
    const simulateDef = CATALOG.scanner.methods.simulateScan

    let unsubscribe = null

    function listen() {
      unsubscribe?.()
      unsubscribe = onDeviceEvent('scanner.scanned', (payload) => {
        pushEvent('scanner.scanned', payload)
        scans.value.unshift({ ts: Date.now(), code: payload?.code ?? JSON.stringify(payload) })
        if (scans.value.length > 50) { scans.value.length = 50 }
      })
      listening.value = true
    }
    listen()

    onUnmounted(() => {
      unsubscribe?.()
      unsubscribe = null
    })

    async function loadConfig() {
      config.value = await call('scanner.getConfig')
    }
    function mockScan() {
      emitMockEvent('scanner.scanned', { code: `MOCK-${Math.random().toString(36).slice(2, 12)}` })
    }

    return { config, scans, listening, bridgeReal, setConfigDef, simulateDef, loadConfig, mockScan }
  },
})
