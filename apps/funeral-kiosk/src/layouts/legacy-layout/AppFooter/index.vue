<script setup lang="ts">
defineProps<{
  isHome?: boolean
}>()

const appStore = useAppStore()

function generateCopyright() {
  const currentYear = new Date().getFullYear()
  const companyName = '上海飞信信息科技有限公司'
  const statement = '技术支持'

  return `© ${currentYear} ${companyName} | ${statement}`
}
</script>

<template>
  <div
    class="bottom-info"
    :class="{
      'bottom-info-home': isHome,
    }"
  >
    <div class="info-left">
      <p>设备号：{{ appStore.deviceName }} {{ appStore.deviceId }}</p>
    </div>
    <div class="info-center">
      <p>{{ generateCopyright() }}</p>
    </div>
    <div class="info-right">
      <!-- <p>资源版本号：{{ appStore.version }}</p> -->
    </div>
  </div>
</template>

<style scoped lang="scss">
/* 底部信息样式 */
.bottom-info {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 15px 40px;
  background: #f5f5f5;
  border-top: 1px solid #e0e0e0;
  color: #666;
  font-size: 14px;

  &-home {
    color: #fff;
    background: transparent;
    border-top: none;
  }
}

.info-left, .info-center, .info-right {
  display: flex;
  align-items: center;
}
</style>
