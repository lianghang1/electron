<script setup lang="ts">
import type { CaptureResult } from '@desktop/shared'

defineProps<{
  /** 缩略条数据：index 为结果数组原始下标，供删除/放大定位 */
  items: { result: CaptureResult, index: number }[]
  /** 正在放大查看的结果下标（高亮标记），null = 未在查看 */
  activeIndex?: number | null
}>()

const emit = defineEmits<{ remove: [index: number], view: [index: number] }>()
</script>

<template>
  <div class="cu-thumbs">
    <template v-if="items.length">
      <figure
        v-for="item in items"
        :key="item.index"
        class="cu-thumbs__thumb"
        :class="{ 'cu-thumbs__thumb--active': item.index === activeIndex }"
        :title="item.result.imagePath"
        @click="emit('view', item.index)"
      >
        <img :src="item.result.thumbDataUrl" alt="拍摄记录">
        <button class="cu-thumbs__del" title="删除" @click.stop="emit('remove', item.index)">
          ×
        </button>
      </figure>
    </template>
    <span v-else class="cu-thumbs__empty">拍摄结果将显示在这里，完成后可删除重拍</span>
  </div>
</template>

<style scoped>
.cu-thumbs {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 86px;
  padding: 6px;
  border: 1px dashed #e0e5ec;
  border-radius: 10px;
  overflow-x: auto;
}

.cu-thumbs__empty {
  width: 100%;
  text-align: center;
  font-size: 11.5px;
  color: #a5adb8;
}

.cu-thumbs__thumb {
  position: relative;
  margin: 0;
  flex-shrink: 0;
  cursor: pointer;
  border-radius: 8px;
  animation: cu-thumb-in 0.18s ease-out;
}

.cu-thumbs__thumb--active img {
  border-color: #0f766e;
  box-shadow: 0 0 0 2px rgba(15, 118, 110, 0.35);
}

@keyframes cu-thumb-in {
  from {
    opacity: 0;
    transform: scale(0.88);
  }

  to {
    opacity: 1;
    transform: scale(1);
  }
}

.cu-thumbs__thumb img {
  display: block;
  height: 72px;
  border: 1px solid #e6eaf0;
  border-radius: 8px;
  background: #10141c;
}

.cu-thumbs__del {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 18px;
  height: 18px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: rgba(15, 23, 42, 0.72);
  color: #fff;
  font-size: 12px;
  line-height: 18px;
  cursor: pointer;
  transition: background-color 0.12s;
}

.cu-thumbs__del:hover {
  background: #dc2626;
}
</style>
