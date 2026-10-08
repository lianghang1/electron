<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'

const loadedAt = new Date().toLocaleString()
const current = ref('查询中…')
/** 维护退出二次确认：首次双击进入确认态，3s 内再双击才真正退出（访客连点不误触） */
const quitArmed = ref(false)
let quitArmTimer: ReturnType<typeof setTimeout> | null = null

onMounted(async () => {
  try {
    const context = await window.desktop.app.getCurrent()
    current.value = context.appId
  }
  catch {
    current.value = 'IPC 桥接失败'
  }
})

onUnmounted(() => {
  if (quitArmTimer)
    clearTimeout(quitArmTimer)
})

function onQuitClick(): void {
  if (quitArmed.value) {
    quitArmed.value = false
    window.desktop.window.quit()
    return
  }
  quitArmed.value = true
  if (quitArmTimer)
    clearTimeout(quitArmTimer)
  quitArmTimer = setTimeout(() => {
    quitArmed.value = false
  }, 3000)
}
</script>

<template>
  <main class="screen">
    <h1>殡仪服务自助机</h1>
    <ul>
      <li>应用：{{ current }}</li>
      <li>加载时间：{{ loadedAt }}</li>
    </ul>
    <button class="quit" :class="{ armed: quitArmed }" @click="onQuitClick">
      {{ quitArmed ? '再次双击确认退出' : '维护退出' }}
    </button>
  </main>
</template>

<style scoped>
.screen {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100vh;
  background: #10131a;
  color: #e8ecf4;
  font-family: system-ui, sans-serif;
  user-select: none;
}

h1 {
  margin: 0 0 40px;
  font-size: 48px;
  letter-spacing: 6px;
}

ul {
  margin: 0;
  padding: 0;
  list-style: none;
  font-size: 14px;
  color: #9aa5b8;
  text-align: left;
}

li + li {
  margin-top: 8px;
}

/* 维护退出：访客不显眼的角落位，双击确认防误触（正式业务界面落地后挪入维护入口） */
.quit {
  position: fixed;
  right: 16px;
  bottom: 12px;
  border: none;
  background: transparent;
  color: #3d4658;
  font-size: 12px;
  cursor: pointer;
  padding: 6px 10px;
}

.quit.armed {
  color: #e05a4e;
}
</style>
