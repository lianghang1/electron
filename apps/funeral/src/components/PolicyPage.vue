<script setup lang="ts">
const emit = defineEmits<{ back: [] }>()

// mock 内容：真实部署替换为民政部门发布的最新政策与办事指南
const POLICIES = [
  {
    name: '惠民殡葬政策',
    desc: '本市户籍居民可减免基本殡葬服务费用（遗体接运、冷藏、火化、骨灰寄存等），办理时请携带逝者户口簿与经办人身份证',
  },
  {
    name: '火化办事指南',
    desc: '需携带：死亡证明、逝者户口簿、经办人身份证。正常死亡凭医疗机构出具证明，非正常死亡凭公安机关证明',
  },
  {
    name: '骨灰领取',
    desc: '凭寄存证与经办人身份证领取骨灰，代办的需另持委托书与代办人身份证',
  },
  {
    name: '发票开具',
    desc: '缴费后可在自助终端开具电子发票，支持个人与企业抬头，企业抬头需纳税人识别号',
  },
]
</script>

<template>
  <div class="fp-page">
    <div class="fp-head">
      <h2 class="fp-title">
        政策指引
      </h2>
      <button class="fp-back" @click="emit('back')">
        返回首页
      </button>
    </div>
    <div class="fp-list">
      <div v-for="policy in POLICIES" :key="policy.name" class="fp-row">
        <span class="fp-row__name">{{ policy.name }}</span>
        <span class="fp-row__desc">{{ policy.desc }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.fp-page {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.fp-head {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
}
.fp-title {
  font-size: 26px;
  font-weight: 600;
  margin: 0;
}
.fp-back {
  height: 52px;
  padding: 0 32px;
  border: 1px solid #d9d5cf;
  border-radius: 10px;
  background: #ffffff;
  color: #2b3540;
  font-size: 18px;
  cursor: pointer;
  font-family: inherit;
}
.fp-back:hover {
  background: #f2f0ec;
}
.fp-list {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
}
.fp-row {
  flex: 1;
  display: flex;
  align-items: center;
  border: 1px solid #e3e0db;
  border-radius: 12px;
  background: #ffffff;
  padding: 0 36px;
  margin-bottom: 12px;
}
.fp-row:last-child {
  margin-bottom: 0;
}
.fp-row__name {
  width: 170px;
  flex: none;
  font-size: 20px;
  font-weight: 600;
  color: #3a4a5a;
}
.fp-row__desc {
  font-size: 16px;
  color: #6b7684;
  line-height: 1.7;
}
</style>
