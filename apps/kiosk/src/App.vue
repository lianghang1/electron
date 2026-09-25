<script setup lang="ts">
import { onMounted, ref } from 'vue'

const loadedAt = new Date().toLocaleString()
const current = ref('查询中…')

onMounted(async () => {
  try {
    const context = await window.desktop.app.getCurrent()
    current.value = `${context.manifest.name} (${context.appId})`
  }
  catch {
    current.value = 'IPC 桥接失败'
  }
})
</script>

<template>
  <main class="kiosk-screen">
    <h1>Kiosk</h1>
    <p class="sub">
      自助机骨架 · 全屏单应用形态
    </p>
    <ul>
      <li>应用：{{ current }}</li>
      <li>加载时间：{{ loadedAt }}</li>
    </ul>
  </main>
</template>

<style scoped>
.kiosk-screen {
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
  margin: 0;
  font-size: 56px;
  letter-spacing: 8px;
}

.sub {
  margin: 12px 0 40px;
  color: #7c8698;
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
</style>
