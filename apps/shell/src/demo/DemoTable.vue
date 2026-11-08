<script setup lang="ts">
import { Button } from '@shell/ui'
import { ChevronLeft, ChevronRight, Plus, Search } from 'lucide-vue-next'

defineProps<{
  title: string
  columns: string[]
  rows: string[][]
  total: number
}>()
</script>

<template>
  <div class="flex h-full w-full flex-col bg-card text-foreground">
    <div class="flex h-14 items-center gap-3 border-b border-border px-5">
      <h1 class="text-ui-lg font-semibold">
        {{ title }}
      </h1>
      <span class="text-ui-caption text-foreground-subtle">共 {{ total }} 条</span>
      <div class="ml-auto flex items-center gap-2">
        <div class="flex h-8 w-50 items-center gap-2 rounded-md border border-border px-2.5">
          <Search :size="14" class="text-foreground-subtle" />
          <input class="min-w-0 flex-1 bg-transparent text-ui-caption outline-none placeholder:text-foreground-subtle" placeholder="搜索编号 / 名称">
        </div>
        <Button variant="outline" size="sm" class="h-8">
          导出
        </Button>
        <Button size="sm" class="h-8">
          <Plus :size="14" />新建
        </Button>
      </div>
    </div>

    <div class="flex h-10 items-center gap-1 border-b border-border px-5">
      <Button variant="soft" size="sm">
        全部
      </Button>
      <Button variant="ghost" size="sm">
        待处理
      </Button>
      <Button variant="ghost" size="sm">
        办理中
      </Button>
      <Button variant="ghost" size="sm">
        已完成
      </Button>
    </div>

    <div class="min-h-0 flex-1 overflow-auto">
      <table class="w-full border-collapse text-ui-caption">
        <thead>
          <tr class="bg-surface-hover">
            <th v-for="col in columns" :key="col" class="border-b border-border px-5 py-2.5 text-left font-medium text-foreground-subtle">
              {{ col }}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(row, i) in rows" :key="i" class="demo-row border-b border-border">
            <td v-for="(cell, j) in row" :key="j" class="px-5 py-2.5">
              <span v-if="j === 0" class="font-medium text-primary">{{ cell }}</span>
              <span v-else-if="cell === '已完成'" class="inline-flex items-center gap-1.5"><i class="dot bg-ok" />{{ cell }}</span>
              <span v-else-if="cell === '办理中'" class="inline-flex items-center gap-1.5"><i class="dot bg-primary" />{{ cell }}</span>
              <span v-else-if="cell === '待处理'" class="inline-flex items-center gap-1.5"><i class="dot bg-warn" />{{ cell }}</span>
              <span v-else class="text-muted-foreground">{{ cell }}</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="flex h-11 items-center justify-end gap-3 border-t border-border px-5">
      <span class="text-ui-sm text-foreground-subtle">第 1 / 8 页</span>
      <Button variant="outline" size="icon-sm">
        <ChevronLeft :size="14" />
      </Button>
      <Button variant="outline" size="icon-sm">
        <ChevronRight :size="14" />
      </Button>
    </div>
  </div>
</template>

<style scoped>
.demo-row:hover {
  background: var(--hover);
}
.dot {
  display: inline-block;
  width: 6px;
  height: 6px;
  border-radius: 50%;
}
</style>
