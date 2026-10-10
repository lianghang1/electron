import { onUnmounted, ref } from 'vue'

/**
 * 背景音乐播放控制（Web 版）
 */
export function useBgm() {
  const isPlaying = ref(false)
  const currentUrl = ref('')
  let audio: HTMLAudioElement | null = null

  /** 创建或复用音频实例 */
  function ensureCtx(url: string): HTMLAudioElement {
    if (!audio) {
      audio = new Audio()
      audio.loop = true
      audio.autoplay = false
      audio.addEventListener('play', () => {
        isPlaying.value = true
      })
      audio.addEventListener('pause', () => {
        isPlaying.value = false
      })
      audio.addEventListener('ended', () => {
        isPlaying.value = false
      })
      audio.addEventListener('error', () => {
        isPlaying.value = false
      })
    }
    if (currentUrl.value !== url) {
      audio.src = url
      currentUrl.value = url
    }
    return audio
  }

  /** 播放指定音乐 */
  function play(url: string) {
    if (!url) {
      stop()
      return
    }
    const ctx = ensureCtx(url)
    ctx.play().catch(() => {
      isPlaying.value = false
    })
  }

  /** 暂停 */
  function pause() {
    if (audio && isPlaying.value)
      audio.pause()
  }

  /** 停止并重置 */
  function stop() {
    if (audio) {
      audio.pause()
      audio.currentTime = 0
      isPlaying.value = false
    }
  }

  /** 切换播放/暂停 */
  function toggle(url: string) {
    if (!url)
      return
    if (isPlaying.value && currentUrl.value === url)
      pause()
    else
      play(url)
  }

  /** 销毁音频实例 */
  function destroy() {
    if (audio) {
      audio.pause()
      audio.src = ''
      audio = null
      isPlaying.value = false
      currentUrl.value = ''
    }
  }

  onUnmounted(() => {
    destroy()
  })

  return { isPlaying, currentUrl, play, pause, stop, toggle, destroy }
}
