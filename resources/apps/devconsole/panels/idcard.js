import { defineAsyncComponent, defineComponent, ref } from 'vue'
import { CATALOG } from '../js/catalog.js'
import { call } from '../js/jsapi.js'

/** 身份证阅读器：枚举 / 读卡 / 档案配置。 */
export default defineComponent({
  name: 'IdcardPanel',
  components: { InvokeForm: defineAsyncComponent(() => import('../js/components/invoke-form.js').then(m => m.default)), DeviceList: defineAsyncComponent(() => import('../js/components/device-list.js').then(m => m.default)) },
  setup() {
    const devices = ref(null)
    const card = ref(null)
    const config = ref(null)

    const readCardDef = CATALOG.idcard.methods.readCard
    const setConfigDef = CATALOG.idcard.methods.setConfig

    async function loadDevices() {
      devices.value = await call('idcard.listDevices')
    }
    async function onRead({ result }) {
      card.value = result
    }
    async function loadConfig() {
      config.value = await call('idcard.getConfig')
    }

    const CARD_FIELDS = [
      ['name', '姓名'], ['sex', '性别'], ['nation', '民族'], ['birth', '出生日期'],
      ['address', '住址'], ['idNumber', '公民身份号码'], ['issuingAuthority', '签发机关'],
      ['validFrom', '有效期起'], ['validTo', '有效期至'],
    ]

    return { devices, card, config, readCardDef, setConfigDef, CARD_FIELDS, loadDevices, onRead, loadConfig }
  },
})
