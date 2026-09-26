<script setup lang="ts">
const emit = defineEmits<{ back: [] }>()

// mock 内容：真实部署替换为殡仪馆服务目录数据（业务系统下发或构建内置）
const SERVICES = [
  { name: '遗体接运', desc: '全市范围内接运，请提前电话预约，家属需备死亡证明' },
  { name: '遗体冷藏', desc: '提供普通冷藏与单体冷藏，按天计费' },
  { name: '告别仪式', desc: '大、中、小型告别厅，可预约主持与礼仪服务' },
  { name: '火化服务', desc: '普通炉与捡灰炉，家属可在场送别' },
  { name: '骨灰寄存', desc: '短期与长期寄存，凭寄存证领取' },
]
</script>

<template>
  <div class="fs-page">
    <div class="fs-head">
      <h2 class="fs-title">
        服务介绍
      </h2>
      <button class="fs-back" @click="emit('back')">
        返回首页
      </button>
    </div>
    <div class="fs-list">
      <div v-for="service in SERVICES" :key="service.name" class="fs-row">
        <span class="fs-row__name">{{ service.name }}</span>
        <span class="fs-row__desc">{{ service.desc }}</span>
      </div>
      <div class="fs-note">
        各项服务收费标准以大厅公示为准，如有疑问请联系服务台
      </div>
    </div>
  </div>
</template>

<style scoped>
.fs-page {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.fs-head {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
}
.fs-title {
  font-size: 26px;
  font-weight: 600;
  margin: 0;
}
.fs-back {
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
.fs-back:hover {
  background: #f2f0ec;
}
.fs-list {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
}
.fs-row {
  flex: 1;
  display: flex;
  align-items: center;
  border: 1px solid #e3e0db;
  border-radius: 12px;
  background: #ffffff;
  padding: 0 36px;
  margin-bottom: 12px;
}
.fs-row:last-of-type {
  margin-bottom: 0;
}
.fs-row__name {
  width: 150px;
  flex: none;
  font-size: 22px;
  font-weight: 600;
  color: #3a4a5a;
}
.fs-row__desc {
  font-size: 17px;
  color: #6b7684;
}
.fs-note {
  flex: none;
  text-align: center;
  font-size: 14px;
  color: #9aa2ac;
  padding: 14px 0 4px;
}
</style>
