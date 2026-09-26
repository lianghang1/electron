<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { fh } from './api/fh'
import InvoicePage from './components/InvoicePage.vue'
import PayPage from './components/PayPage.vue'
import PolicyPage from './components/PolicyPage.vue'
import ServicePage from './components/ServicePage.vue'

type Page = 'home' | 'pay' | 'invoice' | 'service' | 'policy'

const page = ref<Page>('home')
const machineId = ref('FH-0001')
const hallName = ref('市殡仪馆')
const now = ref(new Date())

let timer: ReturnType<typeof setInterval> | null = null

onMounted(async () => {
  try {
    const config = await fh.getConfig()
    machineId.value = config.machineId
    hallName.value = config.hallName
  }
  catch {
    // 配置不可用时使用默认值渲染
  }
  timer = setInterval(() => (now.value = new Date()), 1000)
})

onBeforeUnmount(() => {
  if (timer)
    clearInterval(timer)
})

const NAV = [
  { key: 'pay', title: '业务缴费', desc: '扫码或身份证查询 · 扫码支付' },
  { key: 'invoice', title: '发票服务', desc: '查询发票 · 开具发票' },
  { key: 'service', title: '服务介绍', desc: '服务项目 · 办理流程' },
  { key: 'policy', title: '政策指引', desc: '殡葬政策 · 办事指南' },
] satisfies { key: Page, title: string, desc: string }[]
</script>

<template>
  <div class="fk-screen">
    <header class="fk-header">
      <div class="fk-header__title">
        {{ hallName }} · 自助服务终端
      </div>
      <div class="fk-header__meta">
        <span>{{ now.toLocaleDateString('zh-CN') }} {{ now.toLocaleTimeString('zh-CN', { hour12: false }) }}</span>
        <span class="fk-header__machine">机器编号 {{ machineId }}</span>
      </div>
    </header>

    <main class="fk-body">
      <PayPage v-if="page === 'pay'" @back="page = 'home'" />
      <InvoicePage v-else-if="page === 'invoice'" @back="page = 'home'" />
      <ServicePage v-else-if="page === 'service'" @back="page = 'home'" />
      <PolicyPage v-else-if="page === 'policy'" @back="page = 'home'" />

      <div v-else class="fk-home">
        <button
          v-for="item in NAV"
          :key="item.key"
          class="fk-nav"
          @click="page = item.key"
        >
          <span class="fk-nav__title">{{ item.title }}</span>
          <span class="fk-nav__desc">{{ item.desc }}</span>
        </button>
      </div>
    </main>

    <footer class="fk-footer">
      请安心办理 · 如有疑问请联系大厅服务人员
    </footer>
  </div>
</template>

<style scoped>
.fk-screen {
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: #f7f6f3;
  color: #2b3540;
  font-family: system-ui, 'Segoe UI', 'PingFang SC', sans-serif;
  user-select: none;
}
.fk-header {
  height: 76px;
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: #3d4a56;
  color: #ffffff;
  padding: 0 32px;
}
.fk-header__title {
  font-size: 26px;
  font-weight: 600;
  letter-spacing: 2px;
}
.fk-header__meta {
  display: flex;
  align-items: center;
  font-size: 16px;
}
.fk-header__machine {
  margin-left: 24px;
  padding: 4px 14px;
  border: 1px solid rgba(255, 255, 255, 0.35);
  border-radius: 6px;
}
.fk-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 28px 32px;
}
.fk-home {
  flex: 1;
  display: grid;
  grid-template-columns: 1fr 1fr;
  grid-auto-rows: 1fr;
}
.fk-nav {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
  border: 1px solid #e3e0db;
  border-radius: 14px;
  background: #ffffff;
  padding: 0 40px;
  margin: 0 20px 20px 0;
  cursor: pointer;
  text-align: left;
  font-family: inherit;
  transition: background 0.15s ease;
}
.fk-nav:nth-child(2n) {
  margin-right: 0;
}
.fk-nav:nth-child(n + 3) {
  margin-bottom: 0;
}
.fk-nav:hover {
  background: #f2f0ec;
}
.fk-nav:active {
  background: #eae7e1;
}
.fk-nav__title {
  font-size: 30px;
  font-weight: 600;
  color: #3a4a5a;
}
.fk-nav__desc {
  font-size: 16px;
  color: #6b7684;
  margin-top: 8px;
}
.fk-footer {
  flex: none;
  text-align: center;
  font-size: 14px;
  color: #9aa2ac;
  padding: 14px 0 18px;
}
</style>
