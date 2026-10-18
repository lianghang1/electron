import type { ScannerConfig, ScanResult } from '@desktop/shared'
import { reactive, ref } from 'vue'

/**
 * 扫码枪设置面板视图状态（reactive 扁平化，经 props 传入面板直接绑定，
 * 状态归系统设置弹窗持有，面板只做展示与动作转发）。
 */
export interface ScannerConfigView {
  config: ScannerConfig
  loading: boolean
  saving: boolean
  /** 模拟扫码测试进行中标记（防重复提交） */
  testing: boolean
  /** 保存/测试成功提示（短暂展示后清除） */
  message: string
  error: string
  load: () => Promise<void>
  save: () => Promise<void>
  /** 模拟扫码测试：先保存当前表单配置再走真实识别链路，结果经 message 反馈 */
  simulate: (code: string) => Promise<void>
}

/** 未载入前的占位值（load 成功后整体覆盖） */
const EMPTY_CONFIG: ScannerConfig = {
  enabled: true,
  timeout: 100,
  minLength: 4,
  endKey: 'Enter',
  prefixes: [],
  requirePrefix: false,
}

export function useScannerConfig(): ScannerConfigView {
  const config = ref<ScannerConfig>({ ...EMPTY_CONFIG })
  const loading = ref(false)
  const saving = ref(false)
  const testing = ref(false)
  const message = ref('')
  const error = ref('')
  let messageTimer: ReturnType<typeof setTimeout> | null = null

  /** 载入当前配置（失败显错，保留占位值供编辑） */
  async function load(): Promise<void> {
    loading.value = true
    error.value = ''
    try {
      config.value = await window.desktop.scanner.getConfig()
    }
    catch (err) {
      error.value = describeError(err, '配置载入失败')
    }
    finally {
      loading.value = false
    }
  }

  /** 保存：全字段 patch 提交（ipc 层白名单收敛）→ 回读确认 */
  async function save(): Promise<void> {
    if (!validate()) { return }
    saving.value = true
    error.value = ''
    try {
      // IPC 走 structured clone：必须传纯对象快照，Vue 响应式 Proxy 无法克隆
      await window.desktop.scanner.setConfig({
        enabled: config.value.enabled,
        timeout: config.value.timeout,
        minLength: config.value.minLength,
        endKey: config.value.endKey,
        prefixes: [...config.value.prefixes],
        requirePrefix: config.value.requirePrefix,
      })
      config.value = await window.desktop.scanner.getConfig()
      showMessage('已保存')
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
    const { timeout, minLength, endKey } = config.value
    if (!Number.isFinite(timeout) || timeout <= 0) {
      error.value = '结束判定超时必须为正数（毫秒）'
      return false
    }
    if (!Number.isInteger(minLength) || minLength < 0) {
      error.value = '最小条码长度必须为不小于 0 的整数'
      return false
    }
    if (!endKey.trim()) {
      error.value = '结束键不能为空'
      return false
    }
    if (config.value.requirePrefix && config.value.prefixes.length === 0) {
      error.value = '强制前缀命中需至少配置一个前缀'
      return false
    }
    return true
  }

  /** 模拟扫码测试：先保存当前表单配置（识别走已保存配置），再走真实缓冲→识别→广播链路 */
  async function simulate(code: string): Promise<void> {
    await save()
    if (error.value) { return }
    testing.value = true
    try {
      const result: ScanResult = await window.desktop.scanner.simulate(code)
      showMessage(result.prefix
        ? `识别成功：${result.code} → 去前缀 ${result.rawCode}（前缀 ${result.prefix}）`
        : `识别成功：${result.code}`)
    }
    catch (err) {
      error.value = describeError(err, '模拟扫码失败')
    }
    finally {
      testing.value = false
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

  return reactive({ config, loading, saving, testing, message, error, load, save, simulate })
}

function describeError(err: unknown, fallback: string): string {
  const message = err instanceof Error ? err.message : String(err)
  return `${fallback}：${message || '未知错误'}`
}
