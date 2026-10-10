let isVoicesLoaded = false
let voices: SpeechSynthesisVoice[] | null = null

// 初始化语音引擎
window.speechSynthesis.onvoiceschanged = () => {
  isVoicesLoaded = true
}

function handleGetCNVoice() {
  if (!voices) {
    voices = window.speechSynthesis.getVoices()
  }
  return voices?.find(e => e.lang === 'zh-CN')
}

function cancelSpeech() {
  window.speechSynthesis.cancel()
}

export async function playSpeech(text: string) {
  if (!isVoicesLoaded) {
    await new Promise<void>((resolve) => {
      const timer = setInterval(() => {
        if (isVoicesLoaded) {
          clearInterval(timer)
          resolve()
        }
      }, 100)
    })
  }

  const chineseVoice = handleGetCNVoice()

  const utterance = new SpeechSynthesisUtterance(text)

  utterance.rate = 1.5 // 语速 0.1 ~ 10
  utterance.pitch = 1.0 // 音高 0 ~ 2
  utterance.volume = 1.0 // 音量 0 ~ 1

  if (chineseVoice) {
    utterance.voice = chineseVoice
  }

  cancelSpeech()
  window.speechSynthesis.speak(utterance)

  return {
    cancel: cancelSpeech,
  }
}
