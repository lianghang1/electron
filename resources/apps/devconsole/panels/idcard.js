import { defineComponent, onMounted, onUnmounted, ref } from 'vue'
import { call } from '../js/jsapi.js'
import { toast } from '../js/toast.js'
import { registerRefresher } from '../js/store.js'

/**
 * 身份证：读卡器下拉（接入方式 + 离线/不可用后缀）+ 读取操作与结果（照片 + 证面字段行式渲染）。
 * 字段名与 IdCardData 契约一致（gender/birthDate/issuer），PII 仅内存展示、不入日志。
 */

const ID_FIELDS = [
  ['name', '姓名'],
  ['gender', '性别'],
  ['nation', '民族'],
  ['birthDate', '出生日期'],
  ['idNumber', '公民身份号码'],
  ['address', '住址'],
  ['issuer', '签发机关'],
]

const TRANSPORT_LABEL = { dll: 'SDK 直连', ws: '本地服务' }

export default defineComponent({
  name: 'IdcardPanel',
  setup() {
    const devices = ref(null)
    const loadError = ref('')
    const readerId = ref('')
    const card = ref(null)
    const reading = ref(false)
    const status = ref('选择读卡器后点击读取')

    async function loadDevices() {
      try {
        devices.value = await call('idcard.listDevices')
        loadError.value = ''
      }
      catch (e) {
        devices.value = []
        loadError.value = e.message ?? String(e)
        return
      }
      if (readerId.value && !devices.value?.some(d => d.id === readerId.value)) { readerId.value = '' }
    }

    const unregister = registerRefresher(loadDevices)
    onMounted(() => { void loadDevices() })
    onUnmounted(unregister)

    async function readCard() {
      reading.value = true
      status.value = '读取中…'
      try {
        card.value = await call('idcard.readCard', readerId.value ? { deviceId: readerId.value } : undefined)
        status.value = '读取成功'
        toast('证卡读取成功')
      }
      catch (e) {
        status.value = `读取失败：${e.code ?? 'UNKNOWN'} · ${e.message ?? '未知错误'}`
        card.value = null
        toast(status.value, false)
      }
      finally {
        reading.value = false
      }
    }

    function clearCard() {
      card.value = null
      status.value = '选择读卡器后点击读取'
      toast('已清空读卡结果')
    }

    function openConfig() {
      void call('overlay.openConfig', { category: 'idcard' })
    }

    return {
      ID_FIELDS, TRANSPORT_LABEL,
      devices, loadError, readerId, card, reading, status,
      loadDevices, readCard, clearCard, openConfig,
    }
  },
})
