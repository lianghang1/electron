import { defineAsyncComponent, defineComponent, onUnmounted, ref } from 'vue'
import { CATALOG } from '../js/catalog.js'
import { bridgeReal, call, emitMockEvent, onDeviceEvent } from '../js/jsapi.js'

/** 拍摄：枚举 / 预览（capture.frame 点对点推送）/ 抓拍 / 保存。离开面板回收预览与订阅。 */
export default defineComponent({
  name: 'CapturePanel',
  components: { InvokeForm: defineAsyncComponent(() => import('../js/components/invoke-form.js').then(m => m.default)), DeviceList: defineAsyncComponent(() => import('../js/components/device-list.js').then(m => m.default)) },
  setup() {
    const devices = ref(null)
    const previewing = ref(false)
    const previewDeviceId = ref('')
    const frameUrl = ref('')
    const frameCount = ref(0)
    const shot = ref(null)
    const dlgTitle = ref('拍摄浮层')
    const dlgMax = ref(3)
    const dlgDeviceId = ref('')
    const dlgBusy = ref(false)
    const dlgDone = ref(false)
    const dlgResults = ref([])

    const captureImageDef = CATALOG.capture.methods.captureImage

    let unsubscribe = null

    onUnmounted(teardown)

    async function loadDevices() {
      devices.value = await call('capture.listDevices')
      if (!previewDeviceId.value && devices.value?.length) { previewDeviceId.value = devices.value[0].id }
    }

    /** 原生浮层拍摄：invoke 挂起至确认（结果数组）/取消（空数组），发起 tab 销毁平台自动作废 */
    async function openDialog() {
      dlgBusy.value = true
      dlgDone.value = false
      dlgResults.value = []
      try {
        const input = {
          title: dlgTitle.value || undefined,
          maxCount: dlgMax.value > 0 ? dlgMax.value : undefined,
          deviceId: dlgDeviceId.value || undefined,
          deviceLabel: dlgDeviceId.value
            ? devices.value?.find(d => d.id === dlgDeviceId.value)?.displayName
            : undefined,
        }
        const results = await call('capture.openCaptureDialog', input)
        dlgResults.value = Array.isArray(results) ? results : []
        dlgDone.value = !dlgResults.value.length
      }
      finally {
        dlgBusy.value = false
      }
    }

    async function startPreview() {
      await call('capture.startPreview', previewDeviceId.value ? { deviceId: previewDeviceId.value } : undefined)
      unsubscribe?.()
      unsubscribe = onDeviceEvent('capture.frame', (payload) => {
        frameCount.value++
        if (payload?.frame) { frameUrl.value = payload.frame }
      })
      previewing.value = true
    }

    async function stopPreview() {
      await call('capture.stopPreview', { deviceId: previewDeviceId.value })
      teardownListener()
      previewing.value = false
    }

    function teardownListener() {
      unsubscribe?.()
      unsubscribe = null
    }

    /** 离开面板 = 停预览 + 退订帧（预览流是唯一需要回收的资源） */
    async function teardown() {
      teardownListener()
      if (previewing.value) {
        await call('capture.stopPreview', { deviceId: previewDeviceId.value }).catch(() => {})
        previewing.value = false
      }
    }

    async function onCaptured({ result }) {
      shot.value = result
    }
    async function saveShot() {
      if (!shot.value?.dataUrl) { return }
      await call('capture.saveCapturedImage', { imageDataUrl: shot.value.dataUrl, imageExtension: 'png' })
    }

    /** mock 桥下手动产生一帧，验证帧渲染链路 */
    function mockFrame() {
      emitMockEvent('capture.frame', { deviceId: previewDeviceId.value, frame: demoFrame() })
    }
    function demoFrame() {
      const canvas = document.createElement('canvas')
      canvas.width = 320
      canvas.height = 200
      const ctx = canvas.getContext('2d')
      ctx.fillStyle = '#16324f'
      ctx.fillRect(0, 0, 320, 200)
      ctx.fillStyle = '#3f77b4'
      ctx.font = '16px sans-serif'
      ctx.fillText(`capture.frame mock #${frameCount.value + 1}`, 60, 104)
      return canvas.toDataURL('image/png')
    }

    return {
      devices, previewing, previewDeviceId, frameUrl, frameCount, shot, bridgeReal,
      captureImageDef,
      dlgTitle, dlgMax, dlgDeviceId, dlgBusy, dlgDone, dlgResults, openDialog,
      loadDevices, startPreview, stopPreview, onCaptured, saveShot, mockFrame,
    }
  },
})
