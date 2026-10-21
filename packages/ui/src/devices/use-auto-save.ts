import type { WatchSource } from 'vue'
import { onScopeDispose, watch } from 'vue'

/** 自动保存防抖（毫秒）：停止改动后延迟提交，输入过程不落库 */
const AUTOSAVE_DELAY = 600

/**
 * 设置面板改动自动保存：深度监听编辑源，停止改动后防抖提交，替代显式保存按钮。
 * 提交动作自带校验（校验失败不发请求仅提示，待下一次改动重试）；
 * 保存中到期则顺延重试，避免并发期草稿错过提交窗口。
 */
export function useAutoSave(input: {
  /** 改动源（深度监听；载入/保存回填也会触发，dirty=false 时不会提交） */
  source: WatchSource | WatchSource[]
  /** 是否存在未保存改动（到期判定基准） */
  dirty: () => boolean
  /** 保存中（并发保护） */
  saving: () => boolean
  /** 提交动作（内部含校验与错误提示） */
  save: () => void | Promise<void>
}): { flush: () => void } {
  let timer: ReturnType<typeof setTimeout> | null = null

  function schedule(): void {
    if (timer) { clearTimeout(timer) }
    timer = setTimeout(fire, AUTOSAVE_DELAY)
  }

  function fire(): void {
    timer = null
    if (!input.dirty()) { return }
    if (input.saving()) {
      schedule()
      return
    }
    void input.save()
  }

  watch(input.source, schedule, { deep: true })
  onScopeDispose(() => {
    if (timer) { clearTimeout(timer) }
  })

  /** 立即冲刷待存改动（取消防抖定时器并尝试提交；无改动时为空操作） */
  function flush(): void {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
    if (input.dirty() && !input.saving()) {
      void input.save()
    }
  }

  return { flush }
}
