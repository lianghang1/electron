<script setup lang="ts">
/**
 * 纯数字键盘网格：1-9 / 占位 / 0 / X（X 暖金高亮，身份证校验位）。
 * 不持有状态，按键事件完全交给父级处理。
 */
const emit = defineEmits<{ key: [key: string] }>()

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'X']

function press(key: string): void {
  if (key)
    emit('key', key)
}
</script>

<template>
  <div class="fh-numpad">
    <button
      v-for="(key, i) in KEYS"
      :key="i"
      class="fh-numpad__key"
      :class="{ 'fh-numpad__key--x': key === 'X', 'fh-numpad__key--blank': !key }"
      :disabled="!key"
      @click="press(key)"
    >
      {{ key }}
    </button>
  </div>
</template>

<style scoped>
.fh-numpad {
  width: 432px;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
}

.fh-numpad__key {
  height: 64px;
  margin: 0 12px 12px 0;
  border: 1px solid var(--fh-line-strong);
  border-radius: var(--fh-radius-sm);
  background: var(--fh-surface-2);
  color: var(--fh-text);
  font-family: inherit;
  font-size: 24px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.12s ease, border-color 0.12s ease;
}

.fh-numpad__key:nth-child(3n) {
  margin-right: 0;
}

.fh-numpad__key:nth-last-child(-n + 3) {
  margin-bottom: 0;
}

.fh-numpad__key:hover {
  background: #eef1f6;
}

.fh-numpad__key:active {
  background: #e2e8f2;
}

.fh-numpad__key--x {
  background: var(--fh-gold-soft);
  border-color: var(--fh-gold);
  color: var(--fh-gold);
}

.fh-numpad__key--x:hover {
  background: rgb(168 130 60 / 18%);
}

.fh-numpad__key--blank {
  visibility: hidden;
}
</style>
