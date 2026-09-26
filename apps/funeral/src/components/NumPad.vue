<script setup lang="ts">
import { ref } from 'vue'

const emit = defineEmits<{ confirm: [idNumber: string], close: [] }>()

const MAX_LENGTH = 18

const value = ref('')
const error = ref('')

function press(key: string): void {
  error.value = ''
  if (value.value.length >= MAX_LENGTH)
    return
  // X 只能作为最后一位（身份证校验位）
  if (key === 'X')
    value.value = `${value.value.replace('X', '')}X`
  else
    value.value = `${value.value.replace('X', '')}${key}`
}

function backspace(): void {
  value.value = value.value.slice(0, -1)
}

function clear(): void {
  value.value = ''
  error.value = ''
}

function confirm(): void {
  if (!/^(?:\d{15}|\d{17}[\dX])$/.test(value.value)) {
    error.value = '请输入完整身份证号'
    return
  }
  emit('confirm', value.value)
  clear()
}
</script>

<template>
  <div class="fn-numpad">
    <div class="fn-numpad__head">
      <span class="fn-numpad__title">输入身份证号</span>
      <button class="fn-numpad__close" @click="emit('close')">
        关闭
      </button>
    </div>
    <div class="fn-numpad__display" :class="{ 'is-error': error }">
      {{ value || error || '请输入 18 位身份证号' }}
    </div>
    <div class="fn-numpad__keys">
      <button v-for="n in 9" :key="n" class="fn-numpad__key" @click="press(String(n))">
        {{ n }}
      </button>
      <button class="fn-numpad__key" @click="press('X')">
        X
      </button>
      <button class="fn-numpad__key" @click="press('0')">
        0
      </button>
      <button class="fn-numpad__key" @click="backspace">
        退格
      </button>
    </div>
    <div class="fn-numpad__actions">
      <button class="fn-numpad__action" @click="clear">
        清空
      </button>
      <button class="fn-numpad__action fn-numpad__action--primary" @click="confirm">
        确认查询
      </button>
    </div>
  </div>
</template>

<style scoped>
.fn-numpad {
  width: 460px;
  background: #ffffff;
  border: 1px solid #e3e0db;
  border-radius: 14px;
  padding: 20px;
  box-shadow: 0 8px 30px rgba(43, 53, 64, 0.14);
}
.fn-numpad__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}
.fn-numpad__title {
  font-size: 17px;
  font-weight: 600;
  color: #2b3540;
}
.fn-numpad__close {
  border: 1px solid #d9d5cf;
  background: #f7f6f3;
  border-radius: 8px;
  color: #6b7684;
  font-size: 14px;
  padding: 6px 14px;
  cursor: pointer;
  font-family: inherit;
}
.fn-numpad__display {
  height: 56px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid #e3e0db;
  border-radius: 10px;
  background: #fafaf8;
  font-size: 22px;
  letter-spacing: 2px;
  color: #2b3540;
  margin-bottom: 14px;
  font-family: 'Consolas', monospace;
}
.fn-numpad__display.is-error {
  color: #b0483a;
  font-size: 16px;
  letter-spacing: 0;
  font-family: inherit;
}
.fn-numpad__keys {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
}
.fn-numpad__key {
  height: 58px;
  border: 1px solid #e3e0db;
  border-radius: 10px;
  background: #fafaf8;
  font-size: 22px;
  color: #2b3540;
  margin: 0 8px 8px 0;
  cursor: pointer;
  font-family: inherit;
}
.fn-numpad__key:nth-child(3n) {
  margin-right: 0;
}
.fn-numpad__key:hover {
  background: #efedea;
}
.fn-numpad__key:active {
  background: #e5e2dd;
}
.fn-numpad__actions {
  display: flex;
  margin-top: 6px;
}
.fn-numpad__action {
  flex: 1;
  height: 54px;
  border: 1px solid #d9d5cf;
  border-radius: 10px;
  background: #f7f6f3;
  color: #2b3540;
  font-size: 18px;
  cursor: pointer;
  font-family: inherit;
}
.fn-numpad__action + .fn-numpad__action {
  margin-left: 12px;
}
.fn-numpad__action--primary {
  background: #3a4a5a;
  border-color: #3a4a5a;
  color: #ffffff;
}
.fn-numpad__action--primary:hover {
  background: #2e3b48;
}
</style>
