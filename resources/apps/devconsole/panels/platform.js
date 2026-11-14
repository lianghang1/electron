import { defineAsyncComponent, defineComponent, onUnmounted, ref } from 'vue'
import { CATALOG } from '../js/catalog.js'
import { call, onDeviceEvent } from '../js/jsapi.js'
import { pushEvent } from '../js/store.js'

/** 平台设施：通知 / 应用页签 / 更新 / 下载 —— JSAPI 壳设施受控出口的实测面板。 */

/** 通知级别 → 日志药丸色（success=ok / error=err / 其余=mock 暖色） */
function levelClass(level) {
  if (level === 'success') { return 'ok' }
  if (level === 'error') { return 'err' }
  return 'mock'
}

export default defineComponent({
  name: 'PlatformPanel',
  components: { InvokeForm: defineAsyncComponent(() => import('../js/components/invoke-form.js').then(m => m.default)) },
  setup() {
    const notifications = ref(null)
    const apps = ref(null)
    const current = ref(null)
    const manifest = ref(null)
    const updateState = ref(null)
    const downloads = ref(null)

    const showDef = CATALOG.notification.methods.show
    const openDef = CATALOG.app.methods.open

    // 平台事件推送并入全局事件流；面板内仅维持本地展示状态
    const stopNotification = onDeviceEvent('notification.updated', (payload) => {
      pushEvent('notification.updated', payload)
      notifications.value = payload?.items ?? []
    })
    const stopUpdate = onDeviceEvent('update.state-changed', (payload) => {
      pushEvent('update.state-changed', payload)
      updateState.value = payload
    })
    const stopDownload = onDeviceEvent('download.tasks-changed', (payload) => {
      pushEvent('download.tasks-changed', payload)
      downloads.value = payload?.tasks ?? payload
    })
    onUnmounted(() => {
      stopNotification?.()
      stopUpdate?.()
      stopDownload?.()
    })

    async function loadNotifications() {
      notifications.value = await call('notification.list')
    }
    function onShown({ result }) {
      void loadNotifications()
      return result
    }
    async function dismiss(id) {
      await call('notification.dismiss', { id })
      await loadNotifications()
    }
    async function loadApps() {
      apps.value = await call('app.list')
    }
    async function loadCurrent() {
      current.value = await call('app.getCurrent')
    }
    async function loadManifest() {
      manifest.value = await call('app.getManifest')
    }
    async function loadUpdateState() {
      updateState.value = await call('update.state')
    }
    async function checkUpdate() {
      updateState.value = await call('update.check')
    }
    async function loadDownloads() {
      downloads.value = await call('download.list')
    }

    // 下载任务动作（master 下载横幅 打开/文件夹/取消/关闭 的等位出口）
    async function downloadAction(action, t) {
      try {
        await call(`download.${action}`, { taskId: t.id })
        await loadDownloads()
      }
      catch (e) {
        await loadDownloads()
        pushEvent('download.error', { action, taskId: t.id, message: e.message })
      }
    }

    return {
      notifications, apps, current, manifest, updateState, downloads, levelClass,
      showDef, openDef,
      loadNotifications, onShown, dismiss, loadApps, loadCurrent, loadManifest, loadUpdateState, checkUpdate, loadDownloads, downloadAction,
    }
  },
})
