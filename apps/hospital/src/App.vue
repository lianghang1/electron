<script setup lang="ts">
import type { HospitalBusinessConfig } from '@desktop/shared'
import { onBeforeUnmount, onMounted, ref } from 'vue'
import GuidePage from './components/GuidePage.vue'
import RegisterPage from './components/RegisterPage.vue'
import ReportPage from './components/ReportPage.vue'

type Page = 'home' | 'register' | 'report' | 'guide'

const page = ref<Page>('home')
const machineId = ref('H-0001')
const now = ref(new Date())

let timer: ReturnType<typeof setInterval> | null = null

onMounted(async () => {
  try {
    const config: HospitalBusinessConfig = await window.desktop.hospital.getConfig()
    machineId.value = config.machineId
  }
  catch {
    machineId.value = 'H-0001'
  }
  timer = setInterval(() => (now.value = new Date()), 1000)
})

onBeforeUnmount(() => {
  if (timer)
    clearInterval(timer)
})

const NAV: { key: Page, title: string, desc: string }[] = [
  { key: 'register', title: '门诊挂号', desc: '选择科室 · 取号就诊' },
  { key: 'report', title: '报告打印', desc: '读卡或扫码 · 打印报告' },
  { key: 'guide', title: '导诊指引', desc: '楼层分布 · 科室位置' },
]
</script>

<template>
  <div class="hs-screen">
    <header class="hs-header">
      <div class="hs-header__title">
        市第一医院 · 自助服务终端
      </div>
      <div class="hs-header__meta">
        <span>{{ now.toLocaleDateString('zh-CN') }} {{ now.toLocaleTimeString('zh-CN', { hour12: false }) }}</span>
        <span class="hs-header__machine">机器编号 {{ machineId }}</span>
      </div>
    </header>

    <main class="hs-body">
      <RegisterPage v-if="page === 'register'" @back="page = 'home'" />
      <ReportPage v-else-if="page === 'report'" @back="page = 'home'" />
      <GuidePage v-else-if="page === 'guide'" @back="page = 'home'" />

      <div v-else class="hs-home">
        <button
          v-for="item in NAV"
          :key="item.key"
          class="hs-nav"
          @click="page = item.key"
        >
          <span class="hs-nav__title">{{ item.title }}</span>
          <span class="hs-nav__desc">{{ item.desc }}</span>
        </button>
      </div>
    </main>

    <footer class="hs-footer">
      如遇设备故障，请联系大厅导诊人员
    </footer>
  </div>
</template>

<style scoped>
.hs-screen {
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: #f5f8fc;
  color: #17334f;
  font-family: system-ui, 'Segoe UI', 'PingFang SC', sans-serif;
  user-select: none;
}
.hs-header {
  height: 76px;
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: #1a66c2;
  color: #ffffff;
  padding: 0 32px;
}
.hs-header__title {
  font-size: 26px;
  font-weight: 600;
  letter-spacing: 2px;
}
.hs-header__meta {
  display: flex;
  align-items: center;
  font-size: 16px;
}
.hs-header__machine {
  margin-left: 24px;
  padding: 4px 14px;
  border: 1px solid rgba(255, 255, 255, 0.4);
  border-radius: 6px;
}
.hs-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 28px 32px;
}
.hs-home {
  flex: 1;
  display: flex;
  flex-direction: column;
}
.hs-nav {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
  border: 1px solid #d8e4f2;
  border-radius: 14px;
  background: #ffffff;
  padding: 0 40px;
  margin-bottom: 20px;
  cursor: pointer;
  text-align: left;
  font-family: inherit;
  transition: background 0.15s ease;
}
.hs-nav:last-child {
  margin-bottom: 0;
}
.hs-nav:hover {
  background: #eef5fd;
}
.hs-nav:active {
  background: #dcebfd;
}
.hs-nav__title {
  font-size: 30px;
  font-weight: 600;
  color: #1a66c2;
}
.hs-nav__desc {
  font-size: 16px;
  color: #6c86a3;
  margin-top: 8px;
}
.hs-footer {
  flex: none;
  text-align: center;
  font-size: 14px;
  color: #8fa6bf;
  padding: 14px 0 18px;
}
</style>
