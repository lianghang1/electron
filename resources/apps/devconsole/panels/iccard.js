import { defineAsyncComponent, defineComponent, ref } from 'vue'
import { CATALOG } from '../js/catalog.js'
import { call } from '../js/jsapi.js'

/** IC 卡读写：枚举 / 读扇区 / 写块 / 写文本块 / 档案配置。 */
export default defineComponent({
  name: 'IccardPanel',
  components: { InvokeForm: defineAsyncComponent(() => import('../js/components/invoke-form.js').then(m => m.default)), DeviceList: defineAsyncComponent(() => import('../js/components/device-list.js').then(m => m.default)) },
  setup() {
    const devices = ref(null)
    const sector = ref(null)
    const config = ref(null)

    const readSectorDef = CATALOG.iccard.methods.readSector
    const writeSectorDef = CATALOG.iccard.methods.writeSector
    const writeTextsDef = CATALOG.iccard.methods.writeTextBlocks
    const setConfigDef = CATALOG.iccard.methods.setConfig

    async function loadDevices() {
      devices.value = await call('iccard.listDevices')
    }
    async function onRead({ result }) {
      sector.value = result
    }
    async function loadConfig() {
      config.value = await call('iccard.getConfig')
    }

    return { devices, sector, config, readSectorDef, writeSectorDef, writeTextsDef, setConfigDef, loadDevices, onRead, loadConfig }
  },
})
