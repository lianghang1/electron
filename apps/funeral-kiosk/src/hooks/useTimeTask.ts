import { createTimer } from '@desktop/utils'

export function useTimeTask(fn: (next: () => void, stop: () => void) => void, wait: number = 1000, immediate: boolean = false) {
  const task = createTimer(fn, wait, immediate)

  onUnmounted(() => {
    task?.stop()
  })

  return task
}
