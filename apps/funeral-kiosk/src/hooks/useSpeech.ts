import { playSpeech } from '@/utils/speech'

export function useSpeech() {
  let cancelSpeech: () => void

  async function playText(text: string) {
    const { cancel } = await playSpeech(text)
    cancelSpeech = cancel
  }

  onUnmounted(() => {
    cancelSpeech?.()
  })

  return {
    playText,
  }
}
