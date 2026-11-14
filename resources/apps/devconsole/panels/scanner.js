import { computed, defineComponent, onUnmounted, ref } from 'vue'
import { bridgeReal, call, emitMockEvent, onDeviceEvent } from '../js/jsapi.js'
import { fmtTime, pushEvent } from '../js/store.js'
import { toast } from '../js/toast.js'

/**
 * 扫码枪：HID 通道状态直推展示 + 演示注入（与真枪同一条缓冲 → 广播链路）+ 扫码历史。
 * 扫码记录由主进程广播完整 ScanResult（code/prefix/rawCode/timestamp），timestamp 同值去重防双计。
 */

/** 输入框为空时的模拟条码（带前缀，覆盖前缀命中链路） */
const SAMPLE_SCAN_CODE = 'PB:1234567890'

export default defineComponent({
  name: 'ScannerPanel',
  setup() {
    const scans = ref([])
    const listening = ref(false)
    const gunStatus = ref(null)
    const scanInput = ref('')

    // 连接态推送（HID 连接/断开/通道切换）：真实桥由设备服务直推，mock 桥无推送源
    const unsubscribeStatus = onDeviceEvent('scanner.statusUpdated', (payload) => {
      pushEvent('scanner.statusUpdated', payload)
      gunStatus.value = payload
    })
    // 点对点推送：真枪与 simulateScan 走同一条链路，返回值与广播同源
    const unsubscribe = onDeviceEvent('scanner.scanned', (payload) => {
      pushEvent('scanner.scanned', payload)
      pushScan(payload)
    })
    listening.value = true

    function pushScan(payload) {
      const rec = {
        ts: payload?.timestamp ?? Date.now(),
        code: payload?.code ?? JSON.stringify(payload),
        prefix: payload?.prefix ?? null,
        rawCode: payload?.rawCode ?? '',
      }
      if (scans.value.some(h => h.ts === rec.ts)) { return }
      scans.value.unshift(rec)
      if (scans.value.length > 20) { scans.value.length = 20 }
    }

    /** 演示注入：空输入回落样例码（带前缀，覆盖前缀命中链路） */
    async function simulate() {
      const code = scanInput.value.trim() || SAMPLE_SCAN_CODE
      try {
        const r = await call('scanner.simulateScan', { scannedCode: code })
        pushScan(r)
        toast('已模拟一次扫码')
      }
      catch (e) { toast(e.message ?? String(e), false) }
    }

    function mockScan() {
      const code = `MOCK-${Math.random().toString(36).slice(2, 12)}`
      emitMockEvent('scanner.scanned', { code, prefix: null, rawCode: code, timestamp: Date.now() })
    }

    function clearScans() { scans.value = [] }

    function openConfig() { void call('overlay.openConfig', { category: 'scanner' }) }

    /** HID 通道状态行（mode 非 hid 保持空态，等待下次推送） */
    const hidStatus = computed(() => {
      const s = gunStatus.value
      if (!s || s.mode !== 'hid') { return '' }
      return `HID 通道：${s.connected ? `已连接${s.devSN ? `（${s.devSN}）` : ''}` : `不可用${s.note ? ` — ${s.note}` : ''}`}`
    })

    onUnmounted(() => {
      unsubscribe?.()
      unsubscribeStatus?.()
    })

    return {
      scans, listening, gunStatus, scanInput, hidStatus, bridgeReal,
      simulate, mockScan, clearScans, openConfig, fmtTime,
    }
  },
})
