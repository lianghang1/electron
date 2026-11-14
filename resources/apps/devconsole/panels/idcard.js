import { defineAsyncComponent, defineComponent, onMounted, ref } from 'vue'
import { CATALOG } from '../js/catalog.js'
import { call } from '../js/jsapi.js'

/**
 * 身份证：阅读器枚举 + 读卡结构化渲染（照片 + 证面字段）+ 档案配置。
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
  components: { DeviceList: defineAsyncComponent(() => import('../js/components/device-list.js').then(m => m.default)), InvokeForm: defineAsyncComponent(() => import('../js/components/invoke-form.js').then(m => m.default)) },
  setup() {
    const devices = ref(null)
    const readerId = ref('')
    const card = ref(null)
    const reading = ref(false)
    const status = ref('选择读卡器后点击读取')
    const config = ref(null)
    const setConfigDef = CATALOG.idcard.methods.setConfig

    async function loadDevices() {
      devices.value = await call('idcard.listDevices')
      if (readerId.value && !devices.value?.some(d => d.id === readerId.value)) { readerId.value = '' }
    }

    async function readCard() {
      reading.value = true
      status.value = '读取中…'
      try {
        card.value = await call('idcard.readCard', readerId.value ? { deviceId: readerId.value } : undefined)
        status.value = '读取成功'
      }
      catch (e) {
        status.value = `读取失败：[${e.code}] ${e.message}`
        card.value = null
      }
      finally {
        reading.value = false
      }
    }

    function clearCard() {
      card.value = null
      status.value = '已清空读卡结果'
    }

    async function loadConfig() {
      config.value = await call('idcard.getConfig')
    }

    onMounted(() => {
      void loadDevices()
    })

    return {
      ID_FIELDS, TRANSPORT_LABEL,
      devices, readerId, card, reading, status, config, setConfigDef,
      loadDevices, readCard, clearCard, loadConfig,
    }
  },
})
