import { onBeforeUnmount, onMounted } from 'vue'

interface ScannerOptions {
  /** 扫码回调 */
  onScan: (code: string) => void
  /** 最短码长，低于则忽略（过滤人工敲键误触） */
  minLength?: number
}

/** 扫码枪两次按键的最大间隔：超出视为人工输入，缓冲清空 */
const KEY_INTERVAL_MS = 50
const DEFAULT_MIN_LENGTH = 8

/**
 * 扫码枪监听：USB HID 键盘模拟模式——扫码枪瞬间连续输入字符并以 Enter 收尾。
 * 「字符间隔 < 50ms + Enter 收尾 + 最短码长」三重条件区分扫码与人工敲键。
 * 手动输入身份证走软键盘（NumPad），不经过物理键盘流，不会与扫码混淆。
 */
export function useScanner({ onScan, minLength = DEFAULT_MIN_LENGTH }: ScannerOptions): void {
  let buffer = ''
  let lastAt = 0

  function handleKeydown(event: KeyboardEvent): void {
    const now = Date.now()
    if (now - lastAt > KEY_INTERVAL_MS)
      buffer = ''
    lastAt = now

    if (event.key === 'Enter') {
      if (buffer.length >= minLength) {
        onScan(buffer)
        buffer = ''
      }
      return
    }
    if (event.key.length === 1)
      buffer += event.key
  }

  onMounted(() => window.addEventListener('keydown', handleKeydown))
  onBeforeUnmount(() => window.removeEventListener('keydown', handleKeydown))
}
