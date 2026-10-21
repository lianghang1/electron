import type { CaptureDevice, CaptureDeviceConfig, CaptureDeviceOverrides } from '@desktop/shared'
import { isWsUrl } from '@desktop/shared'
import { computed, reactive, ref } from 'vue'
import { useAutoSave } from '../devices/use-auto-save'

/** 设备状态展示序（用于列表状态点配色） */
export type ConfigDeviceStatus = CaptureDevice['status'] | 'missing'

/**
 * 拍摄设置面板视图状态（reactive 扁平化，经 props 传入面板直接绑定，
 * 状态归系统设置弹窗持有，面板只做展示与动作转发）。
 * 档案清单由代码出厂预设锁死：选择 + 选中编辑白名单字段，改动防抖自动保存
 * （切换设备前冲刷待存改动，非法草稿不落库仅提示，关闭弹窗丢弃非法改动）。
 */
export interface CaptureConfigView {
  configs: CaptureDeviceConfig[]
  selectedId: string
  /** 域默认设备统一 id（空串 = 未设置，业务调用回落自动定位） */
  defaultDeviceId: string
  loading: boolean
  saving: boolean
  /** 保存成功提示（短暂展示后清除） */
  message: string
  error: string
  selected: CaptureDeviceConfig | undefined
  /** 选中配置与最近一次保存值存在差异（自动保存判定基准） */
  dirty: boolean
  /** 选中配置对应的统一设备状态（设备 id = "<transport>:<配置 id>"） */
  statusOf: (config: CaptureDeviceConfig) => ConfigDeviceStatus
  load: () => Promise<void>
  select: (id: string) => void
  save: () => Promise<void>
  /** 设为/取消域默认设备（设为当前选中配置对应的设备；取消传 undefined） */
  setDefault: (deviceId: string | undefined) => Promise<void>
  /** 试拍测试进行中标记 */
  snapping: boolean
  /** 试拍结果缩略图（空串 = 暂无结果/设备未返回缩略图） */
  snapThumb: string
  /** 试拍测试：先保存当前配置，再按设备 id 采集一张 */
  snapTest: () => Promise<void>
}

export function useCaptureConfig(): CaptureConfigView {
  const configs = ref<CaptureDeviceConfig[]>([])
  const devices = ref<CaptureDevice[]>([])
  const selectedId = ref('')
  const defaultDeviceId = ref('')
  const loading = ref(false)
  const saving = ref(false)
  const message = ref('')
  const error = ref('')
  const snapping = ref(false)
  const snapThumb = ref('')
  let messageTimer: ReturnType<typeof setTimeout> | null = null

  const selected = computed(() => configs.value.find(c => c.id === selectedId.value))

  /** 各配置最近一次保存值快照（dirty 判定基准，按配置 id 存 JSON） */
  const savedSnapshots = ref(new Map<string, string>())

  const dirty = computed(() => {
    const config = selected.value
    if (!config) { return false }
    return savedSnapshots.value.get(config.id) !== JSON.stringify(config)
  })

  /** 改动防抖自动保存（save 为函数声明提升可用；切换设备经 select 冲刷） */
  const autosave = useAutoSave({
    source: selected,
    dirty: () => dirty.value,
    saving: () => saving.value,
    save,
  })

  function statusOf(config: CaptureDeviceConfig): ConfigDeviceStatus {
    const device = devices.value.find(d => d.id === `${config.transport}:${config.id}`)
    return device?.status ?? 'missing'
  }

  /** 载入配置列表 + 默认设备 + 设备在线状态（设备探测失败不阻断编辑） */
  async function load(): Promise<void> {
    loading.value = true
    error.value = ''
    try {
      configs.value = await window.desktop.capture.getConfig()
      savedSnapshots.value = new Map(configs.value.map(c => [c.id, JSON.stringify(c)]))
      try {
        defaultDeviceId.value = (await window.desktop.capture.getDefaultDevice()) ?? ''
      }
      catch {
        defaultDeviceId.value = ''
      }
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
    autosave.flush()
    selectedId.value = id
    error.value = ''
    snapThumb.value = ''
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
      await window.desktop.capture.setConfig(config.id, snapshotOverrides(config))
      savedSnapshots.value.set(config.id, JSON.stringify(config))
      showMessage('已保存')
    }
    catch (err) {
      error.value = describeError(err, '保存失败')
    }
    finally {
      saving.value = false
    }
  }

  /** 设为/取消域默认设备：立即生效（不随配置保存），成功后更新本地状态 */
  async function setDefault(deviceId: string | undefined): Promise<void> {
    saving.value = true
    error.value = ''
    try {
      await window.desktop.capture.setDefaultDevice(deviceId)
      defaultDeviceId.value = deviceId ?? ''
      showMessage(deviceId ? '已设为默认设备' : '已取消默认设备')
    }
    catch (err) {
      error.value = describeError(err, '设置默认设备失败')
    }
    finally {
      saving.value = false
    }
  }

  /** 试拍测试：先保存当前配置（未保存参数不生效），再按 "<transport>:<配置 id>" 采集一张 */
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

  return reactive({
    configs,
    selectedId,
    defaultDeviceId,
    loading,
    saving,
    message,
    error,
    selected,
    dirty,
    statusOf,
    load,
    select,
    save,
    setDefault,
    snapping,
    snapThumb,
    snapTest,
  })
}

/** 配置 → 现场白名单覆盖（名称 + 连接参数；wake 显式提交，空命令 = 清除拉起命令回落发现式策略） */
function snapshotOverrides(config: CaptureDeviceConfig): CaptureDeviceOverrides {
  return {
    displayName: config.displayName,
    ...(config.ws
      ? {
          ws: {
            url: config.ws.url,
            camId: config.ws.camId,
            width: config.ws.width,
            height: config.ws.height,
            wake: { command: config.ws.wake?.command ?? '' },
          },
        }
      : {}),
    ...(config.service
      ? { service: { baseUrl: config.service.baseUrl, listPath: config.service.listPath, capturePath: config.service.capturePath } }
      : {}),
  }
}

/** 保存前校验：白名单字段的必填连接参数（清单与技术字段由代码出厂预设锁死，无需校验） */
function validate(config: CaptureDeviceConfig): string | null {
  if (!config.displayName.trim()) { return '设备名称不能为空' }
  if (config.transport === 'ws' && config.ws && !isWsUrl(config.ws.url)) { return '高拍仪服务地址不合法（须 ws:// 或 wss:// 前缀）' }
  if (config.transport === 'service' && config.service) {
    if (!config.service.baseUrl.trim()) { return '服务接入必须填写服务地址' }
    if (!config.service.capturePath.trim()) { return '服务接入必须填写采集路径' }
  }
  return null
}

function describeError(err: unknown, fallback: string): string {
  const message = err instanceof Error ? err.message : String(err)
  return `${fallback}：${message || '未知错误'}`
}
