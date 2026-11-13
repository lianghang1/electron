import { desktop } from '@shell/bridge/client'
import { onBeforeUnmount, onMounted, ref } from 'vue'

/**
 * 视图落位：上报目标恒为底板元素——底板没有不存在的时候（solo 铺满 / platform 接缝样式档），
 * 任何档位、任何 tab 状态下的首报与重报都命中同一元素，零分支零补报。
 */
export function useViewDock() {
  const dockEl = ref<HTMLElement | null>(null)
  let resizeObserver: ResizeObserver | undefined

  function reportRect() {
    const el = dockEl.value
    if (!el) { return }
    const r = el.getBoundingClientRect()
    desktop().reportContentRect({ x: r.left, y: r.top, width: r.width, height: r.height })
  }

  function onResize() {
    reportRect()
  }

  onMounted(() => {
    reportRect()
    resizeObserver = new ResizeObserver(reportRect)
    if (dockEl.value) { resizeObserver.observe(dockEl.value) }
    window.addEventListener('resize', onResize)
  })

  onBeforeUnmount(() => {
    resizeObserver?.disconnect()
    window.removeEventListener('resize', onResize)
  })

  return { dockEl, reportRect }
}
