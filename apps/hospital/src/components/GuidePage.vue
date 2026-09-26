<script setup lang="ts">
const emit = defineEmits<{ back: [] }>()

// mock：真实部署替换为 HIS 导诊数据（或按科室动态联动）
const FLOORS = [
  { floor: '1 层', items: '挂号收费 / 西药房 / 急诊' },
  { floor: '2 层', items: '内科 / 外科 / 抽血室' },
  { floor: '3 层', items: '儿科 / 妇产科 / 输液室' },
  { floor: '4 层', items: '眼科 / 耳鼻喉科 / 皮肤科' },
  { floor: '5 层', items: '口腔科 / 体检中心' },
]
</script>

<template>
  <div class="hg-page">
    <div class="hg-head">
      <h2 class="hg-title">
        导诊指引
      </h2>
      <button class="hg-back" @click="emit('back')">
        返回首页
      </button>
    </div>
    <div class="hg-list">
      <div v-for="item in FLOORS" :key="item.floor" class="hg-row">
        <span class="hg-row__floor">{{ item.floor }}</span>
        <span class="hg-row__items">{{ item.items }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.hg-page {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.hg-head {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
}
.hg-title {
  font-size: 26px;
  font-weight: 600;
  margin: 0;
}
.hg-back {
  height: 52px;
  padding: 0 32px;
  border: 1px solid #c3d6ec;
  border-radius: 10px;
  background: #ffffff;
  color: #1a66c2;
  font-size: 18px;
  cursor: pointer;
  font-family: inherit;
}
.hg-back:hover {
  background: #eef5fd;
}
.hg-list {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.hg-row {
  flex: 1;
  display: flex;
  align-items: center;
  border: 1px solid #d8e4f2;
  border-radius: 12px;
  background: #ffffff;
  padding: 0 36px;
  margin-bottom: 12px;
}
.hg-row:last-child {
  margin-bottom: 0;
}
.hg-row__floor {
  width: 120px;
  flex: none;
  font-size: 22px;
  font-weight: 600;
  color: #1a66c2;
}
.hg-row__items {
  font-size: 18px;
  color: #17334f;
}
</style>
