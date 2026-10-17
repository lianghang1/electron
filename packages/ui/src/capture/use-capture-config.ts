import type { CaptureDevice, CaptureDeviceConfig } from '@desktop/shared'
import type { ComputedRef, Ref } from 'vue'
import { computed, ref } from 'vue'

/** 配置弹窗可选接入方式（uvc=本机摄像头无需配置、stub=内置测试，不进管理界面） */
export const CONFIG_TRANSPORTS: { value: CaptureDeviceConfig['transport'], label: string }[] = [
  { value: 'ws', label: '高拍仪（WebSocket）' },
  { value: 'dll', label: 'SDK 直连（DLL）' },
  { value: 'service', label: '服务接入（HTTP）' },
  { value: 'wia', label: '扫描仪（WIA）' },
]

/** 设备状态展示序（用于列表状态点配色） */
export type ConfigDeviceStatus = CaptureDevice['status'] | 'missing'

/** 拍摄设备配置弹窗状态与动作：列表 + 选中编辑 + 保存/删除（未保存改动关闭即丢弃） */
export interface CaptureConfigUi {
  configs: Ref<CaptureDeviceConfig[]>
  selectedId: Ref<string>
  loading: Ref<boolean>
  saving: Ref<boolean>
  /** 保存/删除成功提示（短暂展示后清除） */
  message: Ref<string>
  error: Ref<string>
  selected: ComputedRef<CaptureDeviceConfig | undefined>
  /** 选中配置对应的统一设备状态（设备 id = "<transport>:<配置 id>"） */
  statusOf: (config: CaptureDeviceConfig) => ConfigDeviceStatus
  load: () => Promise<void>
  select: (id: string) => void
  createDraft: () => void
  save: () => Promise<void>
  remove: () => Promise<void>
  /** 试拍测试进行中标记 */
  snapping: Ref<boolean>
  /** 试拍结果缩略图（空串 = 暂无结果/设备未返回缩略图） */
  snapThumb: Ref<string>
  /** 试拍测试：先保存当前草稿（未保存配置无对应设备），再按设备 id 采集一张 */
  snapTest: () => Promise<void>
}

export function useCaptureConfig(): CaptureConfigUi {
  const configs = ref<CaptureDeviceConfig[]>([])
  const devices = ref<CaptureDevice[]>([])
  const selectedId = ref('')
  const loading = ref(false)
  const saving = ref(false)
  const message = ref('')
  const error = ref('')
  const snapping = ref(false)
  const snapThumb = ref('')
  let messageTimer: ReturnType<typeof setTimeout> | null = null

  const selected = computed(() => configs.value.find(c => c.id === selectedId.value))

  function statusOf(config: CaptureDeviceConfig): ConfigDeviceStatus {
    const device = devices.value.find(d => d.id === `${config.transport}:${config.id}`)
    return device?.status ?? 'missing'
  }

  /** 载入配置列表 + 设备在线状态（设备探测失败不阻断编辑） */
  async function load(): Promise<void> {
    loading.value = true
    error.value = ''
    try {
      configs.value = await window.desktop.capture.getConfig()
      try {
        devices.value = await window.desktop.capture.listDevices()
      }
      catch {
        devices.value = []
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
    snapThumb.value = ''
  }

  /** 新建草稿：自动生成 id 并选中，保存前仅存在于本地列表 */
  function createDraft(): void {
    const draft: CaptureDeviceConfig = {
      id: `custom-${crypto.randomUUID().slice(0, 8)}`,
      brand: '',
      displayName: '新建设备',
      transport: 'ws',
      ws: { url: '' },
    }
    configs.value = [...configs.value, draft]
    selectedId.value = draft.id
    error.value = ''
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
      await window.desktop.capture.setConfig(snapshot(config))
      showMessage('已保存')
    }
    catch (err) {
      error.value = describeError(err, '保存失败')
    }
    finally {
      saving.value = false
    }
  }

  async function remove(): Promise<void> {
    const config = selected.value
    if (!config) { return }
    saving.value = true
    error.value = ''
    try {
      const removed = await window.desktop.capture.removeConfig(config.id)
      configs.value = configs.value.filter(c => c.id !== config.id)
      selectedId.value = configs.value[0]?.id ?? ''
      showMessage(removed ? '已删除' : '已移除本地未保存项')
    }
    catch (err) {
      error.value = describeError(err, '删除失败')
    }
    finally {
      saving.value = false
    }
  }

  /** 试拍测试：先保存当前草稿（未保存的配置没有对应设备），再按 "<transport>:<配置 id>" 采集一张 */
  async function snapTest(): Promise<void> {
    await save()
    if (error.value) { return }
    const config = selected.value
    if (!config) { return }
    snapping.value = true
    try {
      const result = await window.desktop.capture.snap({ deviceId: `${config.transport}:${config.id}` })
      snapThumb.value = result.thumbDataUrl ?? ''
      showMessage('试拍成功')
    }
    catch (err) {
      error.value = describeError(err, '试拍失败')
    }
    finally {
      snapping.value = false
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

  return {
    configs,
    selectedId,
    loading,
    saving,
    message,
    error,
    selected,
    statusOf,
    load,
    select,
    createDraft,
    save,
    remove,
    snapping,
    snapThumb,
    snapTest,
  }
}

/** 保存前校验：transport 对应的必填连接参数 */
function validate(config: CaptureDeviceConfig): string | null {
  if (!config.displayName.trim()) { return '设备名称不能为空' }
  if (config.transport === 'ws' && !config.ws?.url.trim()) { return '高拍仪必须填写 WebSocket 地址' }
  if (config.transport === 'dll' && !config.dll?.file.trim()) { return 'SDK 直连必须填写 DLL 路径' }
  if (config.transport === 'service') {
    if (!config.service?.baseUrl.trim()) { return '服务接入必须填写服务地址' }
    if (!config.service.capturePath.trim()) { return '服务接入必须填写采集路径' }
  }
  return null
}

/** IPC 走 structured clone：必须传纯对象快照，Vue 响应式 Proxy 无法克隆 */
function snapshot(config: CaptureDeviceConfig): CaptureDeviceConfig {
  return {
    ...config,
    dll: config.dll
      ? { ...config.dll, functions: config.dll.functions ? { ...config.dll.functions } : undefined }
      : undefined,
    ws: config.ws ? { ...config.ws } : undefined,
    service: config.service
      ? { ...config.service, extraHeaders: config.service.extraHeaders ? { ...config.service.extraHeaders } : undefined }
      : undefined,
    capabilities: config.capabilities ? { ...config.capabilities } : undefined,
  }
}

function describeError(err: unknown, fallback: string): string {
  const message = err instanceof Error ? err.message : String(err)
  return `${fallback}：${message || '未知错误'}`
}
