import { defineAsyncComponent, defineComponent, onMounted, ref } from 'vue'
import { CATALOG } from '../js/catalog.js'
import { call } from '../js/jsapi.js'

/**
 * IC 卡（Mifare Classic）：读写器枚举（能力联动）+ 读扇区结构化渲染（hex/ASCII/文本预览）+
 * 写块安全流（危险块前置拦截 + confirm + 写后回读）+ 字符串组写入（扇区级覆盖 + 校验）。
 * 危险块规则与驱动一致：每扇区末块 = 密钥控制块，0 扇区 0 块 = 厂商块（UID 区）。
 */

const TRANSPORT_LABEL = { dll: 'SDK 直连', ws: '本地服务' }

/** 块 hex → 可打印 ASCII 预览（不可打印字节显示 ·，仅供肉眼核对） */
function toPrintableAscii(hex) {
  let out = ''
  for (let i = 0; i < hex.length; i += 2) {
    const code = Number.parseInt(hex.slice(i, i + 2), 16)
    out += code >= 0x20 && code <= 0x7e ? String.fromCharCode(code) : '·'
  }
  return out
}

/** 块 hex → 文本（截至 0x00，UTF-8 解码；空或含乱码返回 null） */
function toCString(hex) {
  const bytes = []
  for (let i = 0; i < hex.length; i += 2) {
    const byte = Number.parseInt(hex.slice(i, i + 2), 16)
    if (byte === 0) { break }
    bytes.push(byte)
  }
  if (!bytes.length) { return null }
  const text = new TextDecoder('utf-8').decode(new Uint8Array(bytes))
  return text.includes('\uFFFD') ? null : text
}

export default defineComponent({
  name: 'IccardPanel',
  components: { DeviceList: defineAsyncComponent(() => import('../js/components/device-list.js').then(m => m.default)), InvokeForm: defineAsyncComponent(() => import('../js/components/invoke-form.js').then(m => m.default)) },
  setup() {
    const devices = ref(null)
    const readerId = ref('')
    const status = ref('选择读写器后操作')
    const busy = ref(false)
    const config = ref(null)
    const setConfigDef = CATALOG.iccard.methods.setConfig

    // 读扇区
    const readSector = ref(1)
    const readKey = ref('')
    const readKeyType = ref('')
    const sectorData = ref(null)

    // 写块
    const writeBlock = ref(4)
    const writeData = ref('')
    const writeKey = ref('')
    const writeKeyType = ref('')

    // 字符串组
    const textsSector = ref(1)
    const textsInput = ref('')
    const textsKey = ref('')
    const textsKeyType = ref('')
    const textsResult = ref(null)

    const canWrite = ref(false)

    function syncCaps() {
      const dev = devices.value?.find(d => d.id === readerId.value)
      canWrite.value = !!dev?.capabilities?.includes('iccard-write')
    }

    async function loadDevices() {
      devices.value = await call('iccard.listDevices')
      if (readerId.value && !devices.value?.some(d => d.id === readerId.value)) { readerId.value = '' }
      syncCaps()
    }

    function devicePayload(key, keyType) {
      return {
        ...(readerId.value ? { deviceId: readerId.value } : {}),
        ...(key.value.trim() ? { sectorKey: key.value.trim() } : {}),
        ...(keyType.value ? { keyType: keyType.value } : {}),
      }
    }

    async function doReadSector(targetSector = readSector.value, key = readKey, keyType = readKeyType) {
      busy.value = true
      status.value = '读取中…'
      try {
        const r = /** @type {{ uid: string, cardNumber?: string, cardType?: string, blocks: Record<string, string>, texts?: string[] }} */ (await call('iccard.readSector', {
          ...devicePayload(key, keyType),
          sectorNumber: Number(targetSector),
        }))
        return r
      }
      finally {
        busy.value = false
      }
    }

    async function read() {
      try {
        const r = await doReadSector()
        sectorData.value = r
        status.value = '读取成功'
      }
      catch (e) {
        sectorData.value = null
        status.value = `读取失败：[${e.code}] ${e.message}`
      }
    }

    /** 写块安全流：不合法不弹 confirm、不发 IPC；写后同密钥回读展示 */
    async function writeBlockData() {
      const block = Number(writeBlock.value)
      const data = writeData.value.trim().toUpperCase()
      if (!Number.isInteger(block) || block < 0 || block > 63) { status.value = '块地址应为 0-63'; return }
      if (block % 4 === 3) { status.value = `块 ${block} 是密钥控制块，禁止写入`; return }
      if (block === 0) { status.value = '块 0 是厂商块（UID 区），禁止写入'; return }
      if (!/^[0-9A-F]{32}$/.test(data)) { status.value = '数据应为 32 位 hex（16 字节）'; return }
      if (!window.confirm(`确认写入块 ${block}？该操作覆盖原数据 16 字节、不可恢复。`)) { return }
      busy.value = true
      status.value = `写入块 ${block} 中…`
      try {
        await call('iccard.writeSector', {
          ...devicePayload(writeKey, writeKeyType),
          blockNumber: block,
          blockData: data,
        })
        status.value = `块 ${block} 写入成功`
        // 写后回读验证（同扇区同密钥），结果展示在读取区
        readSector.value = Math.floor(block / 4)
        readKey.value = writeKey.value
        readKeyType.value = writeKeyType.value
        const r = await doReadSector()
        sectorData.value = r
      }
      catch (e) {
        status.value = `写入失败：[${e.code}] ${e.message}`
      }
      finally {
        busy.value = false
      }
    }

    /** 字符串组：行尾空白行丢弃（尾部空串写入即清零块，读取时不保留），扇区 1-15 */
    function parseTexts() {
      const texts = textsInput.value.replace(/\r/g, '').split('\n')
      while (texts.length > 0 && texts[texts.length - 1] === '') { texts.pop() }
      return texts
    }

    async function readTexts() {
      const sector = Number(textsSector.value)
      try {
        const r = await doReadSector(sector, textsKey, textsKeyType)
        textsResult.value = r.texts ?? []
        sectorData.value = r
      }
      catch (e) {
        textsResult.value = null
        status.value = `字符串组读取失败：[${e.code}] ${e.message}`
      }
    }

    async function writeTexts() {
      const sector = Number(textsSector.value)
      const texts = parseTexts()
      if (!Number.isInteger(sector) || sector < 1 || sector > 15) { status.value = '扇区应为 1-15（0 扇区首块为厂商块，不可写）'; return }
      if (texts.length > 3) { status.value = '最多 3 行（每扇区 3 个数据块）'; return }
      const tooLong = texts.find(t => new TextEncoder().encode(t).length > 16)
      if (tooLong !== undefined) { status.value = `"${tooLong}" 超出单块容量（UTF-8 16 字节）`; return }
      if (!window.confirm(`确认写入扇区 ${sector}？整扇区覆盖（未占用块清零）、不可恢复。`)) { return }
      busy.value = true
      status.value = `写入扇区 ${sector} 中…`
      try {
        await call('iccard.writeTextBlocks', {
          ...devicePayload(textsKey, textsKeyType),
          sectorNumber: sector,
          textBlocks: texts,
        })
        status.value = `扇区 ${sector} 字符串组写入成功`
        // 写后回读验证，结果展示在字符串组区
        const r = await doReadSector(sector, textsKey, textsKeyType)
        textsResult.value = r.texts ?? []
        sectorData.value = r
      }
      catch (e) {
        status.value = `写入失败：[${e.code}] ${e.message}`
      }
      finally {
        busy.value = false
      }
    }

    async function loadConfig() {
      config.value = await call('iccard.getConfig')
    }

    onMounted(() => {
      void loadDevices()
    })

    return {
      TRANSPORT_LABEL, toPrintableAscii, toCString,
      devices, readerId, status, busy, config, setConfigDef,
      readSector, readKey, readKeyType, sectorData,
      writeBlock, writeData, writeKey, writeKeyType,
      textsSector, textsInput, textsKey, textsKeyType, textsResult,
      canWrite,
      loadDevices, syncCaps, read, writeBlockData, readTexts, writeTexts, loadConfig,
    }
  },
})
