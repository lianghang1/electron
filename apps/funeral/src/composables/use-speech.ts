/**
 * 语音播报：Web Speech API（zh-CN）。
 * 播报前等待语音列表就绪；重复播报先取消上一条。
 */

let voicesReady = false
let voices: SpeechSynthesisVoice[] | null = null

window.speechSynthesis.onvoiceschanged = () => {
  voicesReady = true
}

function getChineseVoice(): SpeechSynthesisVoice | undefined {
  if (!voices)
    voices = window.speechSynthesis.getVoices()
  return voices?.find(voice => voice.lang === 'zh-CN')
}

function cancelSpeech(): void {
  window.speechSynthesis.cancel()
}

export async function playSpeech(text: string): Promise<{ cancel: () => void }> {
  if (!voicesReady) {
    await new Promise<void>((resolve) => {
      const timer = setInterval(() => {
        if (voicesReady) {
          clearInterval(timer)
          resolve()
        }
      }, 100)
    })
  }

  const utterance = new SpeechSynthesisUtterance(text)
  utterance.rate = 1.5
  utterance.pitch = 1.0
  utterance.volume = 1.0

  const chineseVoice = getChineseVoice()
  if (chineseVoice)
    utterance.voice = chineseVoice

  cancelSpeech()
  window.speechSynthesis.speak(utterance)
  return { cancel: cancelSpeech }
}
