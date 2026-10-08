<script setup lang="ts">
import { ref } from 'vue'

const emit = defineEmits<{ back: [] }>()

interface Department {
  code: string
  name: string
  location: string
}

// mock：真实部署替换为 HIS 科室接口（按排班动态出号源）
const DEPARTMENTS: Department[] = [
  { code: 'nk', name: '内科', location: '门诊楼 2 层' },
  { code: 'wk', name: '外科', location: '门诊楼 2 层' },
  { code: 'ek', name: '儿科', location: '门诊楼 3 层' },
  { code: 'fk', name: '妇产科', location: '门诊楼 3 层' },
  { code: 'yk', name: '眼科', location: '门诊楼 4 层' },
  { code: 'ebhk', name: '耳鼻喉科', location: '门诊楼 4 层' },
  { code: 'pfk', name: '皮肤科', location: '门诊楼 4 层' },
  { code: 'kqk', name: '口腔科', location: '门诊楼 5 层' },
]

const step = ref<'select' | 'done'>('select')
const selected = ref<Department | null>(null)
const ticketNo = ref('')

function register(dept: Department): void {
  selected.value = dept
  // mock：真实部署替换为 HIS 挂号接口
  ticketNo.value = `A${String(Math.floor(Math.random() * 60) + 20).padStart(3, '0')}`
  step.value = 'done'
}
</script>

<template>
  <div class="hr-page">
    <template v-if="step === 'select'">
      <div class="hr-head">
        <h2 class="hr-title">
          请选择就诊科室
        </h2>
        <button class="hs-btn-back" @click="emit('back')">
          返回首页
        </button>
      </div>
      <div class="hr-grid">
        <button
          v-for="dept in DEPARTMENTS"
          :key="dept.code + dept.name"
          class="hr-dept"
          @click="register(dept)"
        >
          <span class="hr-dept__name">{{ dept.name }}</span>
          <span class="hr-dept__loc">{{ dept.location }}</span>
        </button>
      </div>
    </template>

    <template v-else-if="selected">
      <div class="hr-done">
        <div class="hr-done__title">
          挂号成功
        </div>
        <div class="hr-done__no">
          {{ ticketNo }}
        </div>
        <div class="hr-done__meta">
          {{ selected.name }} · {{ selected.location }}
        </div>
        <div class="hr-done__hint">
          请按叫号顺序前往相应科室候诊
        </div>
        <div class="hr-done__actions">
          <button class="hs-btn-ghost" @click="emit('back')">
            返回首页
          </button>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.hr-page {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.hr-head {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
}
.hr-title {
  font-size: 26px;
  font-weight: 600;
  margin: 0;
}
.hr-grid {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: 1fr 1fr;
  grid-auto-rows: 1fr;
}
.hr-dept {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
  border: 1px solid #d8e4f2;
  border-radius: 12px;
  background: #ffffff;
  padding: 0 32px;
  margin: 0 10px 10px 0;
  cursor: pointer;
  text-align: left;
  font-family: inherit;
  transition: background 0.15s ease;
}
.hr-dept:nth-child(2n) {
  margin-right: 0;
}
.hr-dept:hover {
  background: #eef5fd;
}
.hr-dept:active {
  background: #dcebfd;
}
.hr-dept__name {
  font-size: 24px;
  font-weight: 600;
  color: #1a66c2;
}
.hr-dept__loc {
  font-size: 15px;
  color: #6c86a3;
  margin-top: 6px;
}
.hr-done {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: #ffffff;
  border: 1px solid #d8e4f2;
  border-radius: 14px;
}
.hr-done__title {
  font-size: 26px;
  color: #17334f;
}
.hr-done__no {
  font-size: 72px;
  font-weight: 700;
  color: #1a66c2;
  letter-spacing: 4px;
  margin: 12px 0;
}
.hr-done__meta {
  font-size: 20px;
  color: #17334f;
}
.hr-done__hint {
  font-size: 16px;
  color: #8fa6bf;
  margin-top: 10px;
}
.hr-done__actions {
  display: flex;
  margin-top: 36px;
}
.hr-done__actions > button + button {
  margin-left: 16px;
}

/* 触屏按钮通用样式（hs- 全局约定，各页复用） */
.hs-btn-back,
.hs-btn-primary,
.hs-btn-ghost {
  height: 52px;
  padding: 0 32px;
  border-radius: 10px;
  font-size: 18px;
  cursor: pointer;
  font-family: inherit;
}
.hs-btn-back {
  border: 1px solid #c3d6ec;
  background: #ffffff;
  color: #1a66c2;
}
.hs-btn-back:hover {
  background: #eef5fd;
}
.hs-btn-primary {
  border: none;
  background: #1a66c2;
  color: #ffffff;
}
.hs-btn-primary:hover {
  background: #155a9e;
}
.hs-btn-primary:disabled {
  background: #7ba7d9;
  cursor: default;
}
.hs-btn-ghost {
  border: 1px solid #c3d6ec;
  background: #ffffff;
  color: #17334f;
}
.hs-btn-ghost:hover {
  background: #eef5fd;
}
</style>
