import type { IcReaderDeviceConfig } from '@desktop/shared'
import type { ConfigDeviceStatus } from '../capture/use-capture-config'
import { isWsUrl } from '@desktop/shared'
import { computed, onScopeDispose, reactive, ref } from 'vue'

/** 删除两步确认的自动复位时长：超时未确认视为放弃 */
const REMOVE_CONFIRM_MS = 3000

/**
 * IC 卡读写设置面板视图状态（reactive 扁平化，状态归系统设置弹窗持有，面板只做展示与动作转发）。
 * 档案制：ws/dll 双路线设备档案列表 + 选中编辑 + 保存/删除，未保存改动关闭即丢弃。
 * 设备在线状态经 listReaders 联动（dll 档案经守护进程在位探测）；
 * ws 路线协议适配未接入，对应档案设备不产出（missing）。
 */
export interface IccardConfigView {
  configs: IcReaderDeviceConfig[]
  selectedId: string
  loading: boolean
  saving: boolean
  /** 保存/删除成功提示（短暂展示后清除） */
  message: string
  error: string
  selected: IcReaderDeviceConfig | undefined
  /** 选中档案与最近一次保存值存在差异（未保存黄条依据） */
  dirty: boolean
  /** 选中档案对应的设备状态（设备 id = "<transport>:<档案 id>"） */
  statusOf: (config: IcReaderDeviceConfig) => ConfigDeviceStatus
  /** 删除两步确认武装中（按钮变「确认删除？」） */
  confirmingRemove: boolean
  load: () => Promise<void>
  select: (id: string) => void
  /** 新增空白档案（本地入列未保存，填写后保存 upsert 落库） */
  add: () => void
  save: () => Promise<void>
  /** 两步确认删除：首次点击武装（超时自动复位），再次点击执行删除 */
  requestRemove: () => void
}

export function useIccardConfig(): IccardConfigView {
  const configs = ref<IcReaderDeviceConfig[]>([])
  const selectedId = ref('')
  const loading = ref(false)
  const saving = ref(false)
  const message = ref('')
  const error = ref('')
  let messageTimer: ReturnType<typeof setTimeout> | null = null

  const selected = computed(() => configs.value.find(c => c.id === selectedId.value))

  /** 各档案最近一次保存值快照（dirty 判定基准，按档案 id 存 JSON） */
  const savedSnapshots = ref(new Map<string, string>())

  const dirty = computed(() => {
    const config = selected.value
    if (!config) { return false }
    return savedSnapshots.value.get(config.id) !== JSON.stringify(config)
  })

  /** 档案 id → 设备状态（load 时经 listReaders 联动） */
  const deviceStatus = ref(new Map<string, ConfigDeviceStatus>())

  /** 档案对应设备的在线状态（档案新建未保存时无设备 → missing） */
  function statusOf(config: IcReaderDeviceConfig): ConfigDeviceStatus {
    const key = `${config.transport}:${config.id}`
    if (!deviceStatus.value.has(key)) { return 'missing' }
    return deviceStatus.value.get(key) ?? 'missing'
  }

  /** 载入档案列表 + 设备在线状态（设备探测失败不阻断编辑） */
  async function load(): Promise<void> {
    loading.value = true
    error.value = ''
    try {
      configs.value = await window.desktop.iccard.getConfig()
      savedSnapshots.value = new Map(configs.value.map(c => [c.id, JSON.stringify(c)]))
      try {
        const readers = await window.desktop.iccard.listReaders()
        deviceStatus.value = new Map(readers.map(r => [r.id, r.status]))
      }
      catch {
        deviceStatus.value = new Map()
      }
      if (!configs.value.some(c => c.id === selectedId.value)) {
        selectedId.value = configs.value[0]?.id ?? ''
      }
    }
    catch (err) {
      error.value = describeError(err, '配置载入失败')
    }
    finally {
      loading.value = false
    }
  }

  function select(id: string): void {
    selectedId.value = id
    error.value = ''
    resetRemoveConfirm()
  }

  /** 新增空白档案：id 本地生成（保存时随档案落库），服务地址留空待填 */
  function add(): void {
    const id = `icreader-${Date.now().toString(36)}`
    const blank: IcReaderDeviceConfig = {
      id,
      displayName: '',
      brand: '',
      transport: 'ws',
      ws: { url: '' },
    }
    configs.value = [...configs.value, blank]
    savedSnapshots.value.delete(id)
    selectedId.value = id
    error.value = ''
    resetRemoveConfirm()
  }

  async function save(): Promise<void> {
    const config = selected.value
    if (!config) { return }
    const problem = validate(config)
    if (problem) {
      error.value = problem
      return
    }
    saving.value = true
    error.value = ''
    try {
      await window.desktop.iccard.setConfig(snapshot(config))
      savedSnapshots.value.set(config.id, JSON.stringify(config))
      showMessage('已保存')
      void refreshStatus()
    }
    catch (err) {
      error.value = describeError(err, '保存失败')
    }
    finally {
      saving.value = false
    }
  }

  async function removeInner(): Promise<void> {
    const config = selected.value
    if (!config) { return }
    saving.value = true
    error.value = ''
    try {
      const removed = await window.desktop.iccard.removeConfig(config.id)
      configs.value = configs.value.filter(c => c.id !== config.id)
      savedSnapshots.value.delete(config.id)
      selectedId.value = configs.value[0]?.id ?? ''
      showMessage(removed ? '已删除' : '未找到对应档案')
    }
    catch (err) {
      error.value = describeError(err, '删除失败')
    }
    finally {
      saving.value = false
    }
  }

  /** 删除两步确认：首次点击武装，超时未确认自动复位（免弹窗的轻量确认） */
  const confirmingRemove = ref(false)
  let removeTimer: ReturnType<typeof setTimeout> | null = null

  function requestRemove(): void {
    if (confirmingRemove.value) {
      resetRemoveConfirm()
      void removeInner()
      return
    }
    confirmingRemove.value = true
    removeTimer = setTimeout(() => {
      confirmingRemove.value = false
      removeTimer = null
    }, REMOVE_CONFIRM_MS)
  }

  function resetRemoveConfirm(): void {
    confirmingRemove.value = false
    if (removeTimer) {
      clearTimeout(removeTimer)
      removeTimer = null
    }
  }

  onScopeDispose(resetRemoveConfirm)

  /** 保存后重拉设备状态（在位探测结果随之刷新） */
  async function refreshStatus(): Promise<void> {
    try {
      const readers = await window.desktop.iccard.listReaders()
      deviceStatus.value = new Map(readers.map(r => [r.id, r.status]))
    }
    catch {
      deviceStatus.value = new Map()
    }
  }

  function showMessage(text: string): void {
    message.value = text
    if (messageTimer) { clearTimeout(messageTimer) }
    messageTimer = setTimeout(() => {
      message.value = ''
      messageTimer = null
    }, 2500)
  }

  return reactive({
    configs,
    selectedId,
    loading,
    saving,
    message,
    error,
    selected,
    dirty,
    statusOf,
    confirmingRemove,
    load,
    select,
    add,
    save,
    requestRemove,
  })
}

/** 保存前校验：与主进程 sanitize 同规则（必填缺失直接提示，不发无效请求） */
function validate(config: IcReaderDeviceConfig): string | null {
  if (!config.displayName.trim()) { return '设备名称不能为空' }
  if (config.transport === 'ws' && !isWsUrl(config.ws.url)) { return '服务地址不合法（须 ws:// 或 wss:// 前缀）' }
  return null
}

/** IPC 走 structured clone：必须传纯对象快照，Vue 响应式 Proxy 无法克隆 */
function snapshot(config: IcReaderDeviceConfig): IcReaderDeviceConfig {
  return config.transport === 'ws' ? { ...config, ws: { ...config.ws } } : { ...config, dll: { ...config.dll } }
}

function describeError(err: unknown, fallback: string): string {
  const message = err instanceof Error ? err.message : String(err)
  return `${fallback}：${message || '未知错误'}`
}
