<script setup lang="ts">
/**
 * 演示用业务页（embedded 形态内容）：刻意做成真实业务系统的信息密度——
 * 工具条 + 筛选 + 表格，灰阶 + 单强调色，无渐变/无卡片套卡片/无欢迎语。
 * 只用于 platform-demo flavor 验证「多应用日常态」，不是壳的一部分。
 */
import { ChevronLeft, ChevronRight, Plus, Search } from 'lucide-vue-next'

defineProps<{
  title: string
  columns: string[]
  rows: string[][]
  total: number
}>()
</script>

<template>
  <div class="flex h-full w-full flex-col" style="color: var(--dt-text-1)">
    <!-- 工具条 -->
    <div class="flex items-center gap-3 px-5" style="height: 56px; border-bottom: 1px solid var(--dt-line)">
      <h1 class="text-[15px] font-semibold">
        {{ title }}
      </h1>
      <span class="text-[12px]" style="color: var(--dt-text-3)">共 {{ total }} 条</span>
      <div class="ml-auto flex items-center gap-2">
        <div class="flex h-8 items-center gap-2 px-2.5" style="border: 1px solid var(--dt-line); border-radius: var(--dt-radius); width: 200px">
          <Search :size="14" style="color: var(--dt-text-3)" />
          <input class="min-w-0 flex-1 bg-transparent text-[12px] outline-none" placeholder="搜索编号 / 名称" style="color: var(--dt-text-1)">
        </div>
        <button class="flex h-8 items-center gap-1 px-2.5 text-[12px]" style="border: 1px solid var(--dt-line); border-radius: var(--dt-radius); color: var(--dt-text-2)">
          导出
        </button>
        <button class="flex h-8 items-center gap-1 px-3 text-[12px] font-medium" style="border-radius: var(--dt-radius); background: var(--dt-accent); color: var(--dt-on-accent)">
          <Plus :size="14" />新建
        </button>
      </div>
    </div>

    <!-- 筛选 -->
    <div class="flex items-center gap-1 px-5" style="height: 40px; border-bottom: 1px solid var(--dt-line)">
      <button class="h-7 px-2.5 text-[12px] font-medium" style="color: var(--dt-accent); background: var(--dt-accent-soft); border-radius: var(--dt-radius)">
        全部
      </button>
      <button class="h-7 px-2.5 text-[12px]" style="color: var(--dt-text-2)">
        待处理
      </button>
      <button class="h-7 px-2.5 text-[12px]" style="color: var(--dt-text-2)">
        办理中
      </button>
      <button class="h-7 px-2.5 text-[12px]" style="color: var(--dt-text-2)">
        已完成
      </button>
    </div>

    <!-- 表格 -->
    <div class="min-h-0 flex-1 overflow-auto">
      <table class="w-full border-collapse text-[12px]">
        <thead>
          <tr style="background: var(--dt-surface-hover)">
            <th v-for="col in columns" :key="col" class="px-5 py-2.5 text-left font-medium" style="color: var(--dt-text-3); border-bottom: 1px solid var(--dt-line)">
              {{ col }}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(row, i) in rows" :key="i" class="demo-row" style="border-bottom: 1px solid var(--dt-line)">
            <td v-for="(cell, j) in row" :key="j" class="px-5 py-2.5">
              <span v-if="j === 0" class="font-medium" style="color: var(--dt-accent)">{{ cell }}</span>
              <span v-else-if="cell === '已完成'" class="inline-flex items-center gap-1.5"><i class="dot" style="background: var(--dt-ok)" />{{ cell }}</span>
              <span v-else-if="cell === '办理中'" class="inline-flex items-center gap-1.5"><i class="dot" style="background: var(--dt-accent)" />{{ cell }}</span>
              <span v-else-if="cell === '待处理'" class="inline-flex items-center gap-1.5"><i class="dot" style="background: var(--dt-warn)" />{{ cell }}</span>
              <span v-else style="color: var(--dt-text-2)">{{ cell }}</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- 分页 -->
    <div class="flex items-center justify-end gap-3 px-5" style="height: 44px; border-top: 1px solid var(--dt-line)">
      <span class="text-[11px]" style="color: var(--dt-text-3)">第 1 / 8 页</span>
      <button class="flex size-7 items-center justify-center" style="border: 1px solid var(--dt-line); border-radius: var(--dt-radius); color: var(--dt-text-2)">
        <ChevronLeft :size="14" />
      </button>
      <button class="flex size-7 items-center justify-center" style="border: 1px solid var(--dt-line); border-radius: var(--dt-radius); color: var(--dt-text-2)">
        <ChevronRight :size="14" />
      </button>
    </div>
  </div>
</template>

<style scoped>
.demo-row:hover {
  background: var(--dt-hover);
}
.dot {
  display: inline-block;
  width: 6px;
  height: 6px;
  border-radius: 50%;
}
input::placeholder {
  color: var(--dt-text-3);
}
</style>
