import type { SignatureConfig } from '@desktop/shared'
import { computed, reactive, ref } from 'vue'

/**
 * 签名屏设置面板视图状态（与 use-scanner-config 同构的扁平化 reactive，
 * 状态归系统设置弹窗持有，面板只做展示与动作转发）。
 */
export interface SignatureConfigView {
  config: SignatureConfig
  loading: boolean
  saving: boolean
  /** 保存成功提示（短暂展示后清除） */
  message: string
  error: string
  /** 表单与最近一次保存值存在差异（未保存黄条依据） */
  dirty: boolean
  load: () => Promise<void>
  save: () => Promise<void>
}

/** 未载入前的占位值（load 成功后整体覆盖；与 core 出厂缺省保持一致） */
const EMPTY_CONFIG: SignatureConfig = {
  wsUrl: 'ws://127.0.0.1:9000',
}

export function useSignatureConfig(): SignatureConfigView {
  const config = ref<SignatureConfig>({ ...EMPTY_CONFIG })
  const loading = ref(false)
  const saving = ref(false)
  const message = ref('')
  const error = ref('')
  let messageTimer: ReturnType<typeof setTimeout> | null = null

  /** 最近一次保存值快照（dirty 判定基准） */
  const savedSnapshot = ref('')

  function toSnapshot(value: SignatureConfig): string {
    return JSON.stringify({ wsUrl: value.wsUrl })
  }

  const dirty = computed(() => toSnapshot(config.value) !== savedSnapshot.value)

  /** 载入当前配置（失败显错，保留占位值供编辑） */
  async function load(): Promise<void> {
    loading.value = true
    error.value = ''
    try {
      config.value = await window.desktop.signature.getConfig()
      savedSnapshot.value = toSnapshot(config.value)
    }
    catch (err) {
      error.value = describeError(err, '配置载入失败')
    }
    finally {
      loading.value = false
    }
  }

  /** 保存：补丁提交（ipc 层白名单收敛）→ 回读确认 */
  async function save(): Promise<void> {
    if (!validate()) { return }
    saving.value = true
    error.value = ''
    try {
      // IPC 走 structured clone：必须传纯对象快照，Vue 响应式 Proxy 无法克隆
      await window.desktop.signature.patchConfig({ wsUrl: config.value.wsUrl.trim() })
      config.value = await window.desktop.signature.getConfig()
      savedSnapshot.value = toSnapshot(config.value)
      showMessage('已保存，签名屏在位状态按新地址重新探测')
    }
    catch (err) {
      error.value = describeError(err, '保存失败')
    }
    finally {
      saving.value = false
    }
  }

  /** 保存前校验：非法值会被 ipc 白名单静默丢弃，与其静默不一致不如显式拦下 */
  function validate(): boolean {
    if (!/^wss?:\/\/.+/i.test(config.value.wsUrl.trim())) {
      error.value = '服务地址必须是 ws:// 或 wss:// 开头的完整地址'
      return false
    }
    return true
  }

  function showMessage(text: string): void {
    message.value = text
    if (messageTimer) { clearTimeout(messageTimer) }
    messageTimer = setTimeout(() => {
      message.value = ''
      messageTimer = null
    }, 2500)
  }

  return reactive({ config, loading, saving, message, error, dirty, load, save })
}

function describeError(err: unknown, fallback: string): string {
  const message = err instanceof Error ? err.message : String(err)
  return `${fallback}：${message || '未知错误'}`
}
