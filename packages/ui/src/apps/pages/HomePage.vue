<script setup lang="ts">
/**
 * 首页（embedded 融合页示例）：工作台门户。
 * 三段式：渐变欢迎横幅 → 应用网格（点卡片即打开）→ 平台状态条。
 * 展示 embedded 形态的标准写法：页面组件直接走 desktop 桥，无视图容器。
 */
import { computed, onMounted, ref } from 'vue'
import { ShieldCheck, Cpu, MonitorSmartphone, ChevronRight, Sparkles } from 'lucide-vue-next'

interface AppSummary {
  manifest: { id: string, name: string, icon?: string }
}

const appList = ref<AppSummary[]>([])
const platform = ref('Windows')
const now = new Date()

const greeting = computed(() => {
  const h = now.getHours()
  if (h < 6) return '夜深了'
  if (h < 12) return '上午好'
  if (h < 18) return '下午好'
  return '晚上好'
})
const dateLabel = computed(() => `${now.getMonth() + 1}月${now.getDate()}日 · ${['周日', '周一', '周二', '周三', '周四', '周五', '周六'][now.getDay()]}`)

/** 应用图标色（与应用中心同源哈希） */
const APP_GRADIENTS = [
  'linear-gradient(135deg,#3b82f6,#60a5fa)',
  'linear-gradient(135deg,#8b5cf6,#c084fc)',
  'linear-gradient(135deg,#f59e0b,#fbbf24)',
  'linear-gradient(135deg,#10b981,#34d399)',
  'linear-gradient(135deg,#ef4444,#f87171)',
  'linear-gradient(135deg,#06b6d4,#22d3ee)',
]
function gradientFor(appId: string): string {
  let hash = 0
  for (const ch of appId)
    hash = (hash * 31 + ch.charCodeAt(0)) >>> 0
  return APP_GRADIENTS[hash % APP_GRADIENTS.length]!
}

async function openApp(appId: string) {
  await window.desktop?.apps.open(appId)
}

onMounted(async () => {
  platform.value = navigator.userAgent.includes('Win') ? 'Windows' : 'Linux'
  const list = await window.desktop?.apps.list() as AppSummary[] | undefined
  appList.value = list ?? []
})
</script>

<template>
  <div class="h-full overflow-auto" style="background: var(--dt-surface)">
    <!-- 欢迎横幅：accent 渐变 -->
    <section
      class="mx-6 mt-5 flex items-center justify-between rounded-2xl px-7 py-6"
      style="background: linear-gradient(120deg, #3b82f6 0%, #6366f1 55%, #8b5cf6 100%); box-shadow: 0 12px 32px rgb(59 130 246 / 0.25)"
    >
      <div>
        <p class="flex items-center gap-2 text-xs font-medium tracking-wide" style="color: rgb(255 255 255 / 0.75)">
          <Sparkles :size="13" />壳平台 v2 · 工作台就绪
        </p>
        <h1 class="mt-1.5 text-2xl font-semibold text-white">{{ greeting }}，欢迎回来</h1>
      </div>
      <div class="text-right">
        <p class="text-sm font-medium text-white">{{ dateLabel }}</p>
        <p class="mt-1 text-xs" style="color: rgb(255 255 255 / 0.7)">{{ platform }}</p>
      </div>
    </section>

    <!-- 应用网格 -->
    <section class="mx-6 mt-6">
      <div class="mb-3 flex items-baseline justify-between">
        <h2 class="text-sm font-semibold" style="color: var(--dt-text-1)">应用</h2>
        <span class="text-xs" style="color: var(--dt-text-3)">{{ appList.length }} 个已接入</span>
      </div>
      <div class="grid grid-cols-3 gap-3" style="max-width: 780px">
        <button
          v-for="app in appList"
          :key="app.manifest.id"
          class="app-card group flex items-center gap-3 rounded-xl p-3.5 text-left"
          style="background: var(--dt-surface); border: 1px solid var(--dt-line)"
          @click="openApp(app.manifest.id)"
        >
          <span
            class="flex size-11 shrink-0 items-center justify-center rounded-xl text-white"
            :style="{ background: gradientFor(app.manifest.id), boxShadow: '0 6px 14px rgb(59 130 246 / 0.22)' }"
          >
            <MonitorSmartphone :size="19" />
          </span>
          <span class="min-w-0 flex-1">
            <span class="block truncate text-sm font-medium" style="color: var(--dt-text-1)">{{ app.manifest.name }}</span>
            <span class="block text-xs" style="color: var(--dt-text-3)">{{ app.manifest.id }}</span>
          </span>
          <ChevronRight :size="15" class="shrink-0 opacity-0 transition-opacity group-hover:opacity-60" style="color: var(--dt-text-3)" />
        </button>

        <div
          v-if="appList.length === 0"
          class="col-span-3 rounded-xl border border-dashed p-6 text-center text-xs"
          style="border-color: var(--dt-line); color: var(--dt-text-3)"
        >
          暂无应用——在 flavor.json 的 apps 清单里登记即可出现在这里
        </div>
      </div>
    </section>

    <!-- 平台状态条 -->
    <section class="mx-6 mb-6 mt-6">
      <h2 class="mb-3 text-sm font-semibold" style="color: var(--dt-text-1)">平台状态</h2>
      <div class="grid grid-cols-3 gap-3" style="max-width: 780px">
        <div class="rounded-xl p-4" style="background: var(--dt-surface-hover); border: 1px solid var(--dt-line)">
          <p class="flex items-center gap-1.5 text-xs" style="color: var(--dt-text-3)"><MonitorSmartphone :size="13" />运行平台</p>
          <p class="mt-1.5 text-base font-semibold" style="color: var(--dt-text-1)">{{ platform }}</p>
        </div>
        <div class="rounded-xl p-4" style="background: var(--dt-surface-hover); border: 1px solid var(--dt-line)">
          <p class="flex items-center gap-1.5 text-xs" style="color: var(--dt-text-3)"><Cpu :size="13" />设备守护进程</p>
          <p class="mt-1.5 flex items-center gap-1.5 text-base font-semibold" style="color: #16a34a">
            <span class="inline-block size-2 rounded-full" style="background: #22c55e; box-shadow: 0 0 6px #22c55e" />自愈模式
          </p>
        </div>
        <div class="rounded-xl p-4" style="background: var(--dt-surface-hover); border: 1px solid var(--dt-line)">
          <p class="flex items-center gap-1.5 text-xs" style="color: var(--dt-text-3)"><ShieldCheck :size="13" />安全策略</p>
          <p class="mt-1.5 text-base font-semibold" style="color: var(--dt-text-1)">白名单生效</p>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.app-card {
  transition: box-shadow 0.18s ease, transform 0.18s ease;
}
.app-card:hover {
  box-shadow: 0 8px 24px rgb(28 36 51 / 0.10);
  transform: translateY(-1px);
}
</style>
