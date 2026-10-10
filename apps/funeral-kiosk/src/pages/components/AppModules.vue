<script setup lang="ts">
import AppModal from '@/components/common/AppModal/index.vue'

const router = useRouter()

// 弹窗提示
const modalVisible = ref(false)
const modalMessage = ref('')

function showDevelopingModal(message: string) {
  modalMessage.value = message
  modalVisible.value = true
}
</script>

<template>
  <div class="app-modules">
    <div class="module-card payment-card" @click="router.push('/payment')">
      <div class="module-icon">
        <span class="i-uiw-pay-circle-o" />
      </div>
      <h3>业务缴费</h3>
      <p>轻松扫码，快速完成缴费</p>
    </div>

    <div class="grid grid-cols-2 gap-20px">
      <div class="module-card invoice-card" @click="router.push('/invoice')">
        <div class="module-icon">
          <span class="i-lets-icons-print-duotone-line" />
        </div>
        <h3>扫码开票</h3>
        <p>便捷开票，无需等待</p>
      </div>
      <div class="module-card electronic-card" @click="router.push('/electronic')">
        <div class="module-icon">
          <span class="i-solar-diploma-verified-outline" />
        </div>
        <h3>电子火化证</h3>
        <p>查询火化证状态</p>
      </div>
    </div>

    <!-- <div class="module-card intro-card" @click="router.push('/common/about')">
      <div class="module-icon">
        <span class="i-streamline-business-handshake-solid" />
      </div>
      <h3>单位介绍</h3>
      <p>了解单位基本情况</p>
    </div> -->

    <div class="module-card intro-card" @click="router.push('/retail')">
      <div class="module-icon">
        <span class="i-streamline-business-handshake-solid" />
      </div>
      <h3>丧葬用品</h3>
      <p>品质保证</p>
    </div>

    <div class="module-card hall-card" @click="router.push('/hall')">
      <div class="module-icon">
        <span class="i-uim-calendar" />
      </div>
      <h3>礼厅预定情况</h3>
      <p>查询礼厅预定状态</p>
    </div>

    <div class="module-card vehicle-card" @click="router.push('/cremation')">
      <div class="module-icon">
        <span class="i-uim-calendar" />
      </div>
      <h3>火化预定情况</h3>
      <p>查询火化预定状态</p>
    </div>

    <div class="module-card faq-card" @click="showDevelopingModal('常见问题解答功能正在开发中，敬请期待！')">
      <div class="module-icon">
        <span class="i-solar-checklist-minimalistic-broken" />
      </div>
      <h3>常见问题解答</h3>
      <p>查看常见问题及解答</p>
    </div>

    <div class="module-card policy-card" @click="showDevelopingModal('惠民政策功能正在开发中，敬请期待！')">
      <div class="module-icon">
        <span class="i-solar-checklist-minimalistic-broken" />
      </div>
      <h3>惠民政策</h3>
      <p>了解相关惠民政策</p>
    </div>

    <!-- 弹窗提示 -->
    <AppModal
      v-model:visible="modalVisible"
      type="info"
      :message="modalMessage"
      confirm-text="知道了"
    />
  </div>
</template>

<style scoped lang="scss">
.app-modules {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 20px;
  max-width: 1200px;
  width: 100%;
  padding: 30px 20px;
  margin: 0 auto;
}

.module-card {
  color: white;
  background: white;
  border-radius: 15px;
  padding: 25px 20px;
  text-align: center;
  cursor: pointer;
  transition: all 0.3s ease;
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.15);
  border: 1px solid rgba(0, 0, 0, 0.1);
  position: relative;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  min-height: 180px;
  gap: 15px;
  transform: translateY(0);
}

.module-card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 5px;
  transform: scaleX(1);
}

.module-card:hover {
  transform: translateY(-5px);
  box-shadow: 0 8px 25px rgba(0, 0, 0, 0.2);
}

.module-icon {
  margin: 0;
  border-radius: 50%;
  display: flex;
  justify-content: center;
  align-items: center;
  font-size: 64px;
  color: white;
  transition: all 0.3s ease;
  position: relative;
  z-index: 2;
}

.module-card:hover .module-icon {
  transform: scale(1.1);
}

.module-card h3 {
  font-size: 18px;
  font-weight: 700;
  margin: 0;
  transition: all 0.3s ease;
  position: relative;
  z-index: 2;
}

.module-card p {
  font-size: 14px;
  color: white;
  margin: 0;
  line-height: 1.5;
  position: relative;
  z-index: 2;
}

.module-card:hover h3 {
  color: inherit;
}

.module-card:hover p {
  color: white;
}

/* 添加发光效果 */
.module-card::after {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  width: 0;
  height: 0;
  border-radius: 50%;
  opacity: 0.1;
  transform: translate(-50%, -50%);
  transition: width 0.6s ease, height 0.6s ease, opacity 0.3s ease;
}

.module-card:hover::after {
  width: 400px;
  height: 400px;
  opacity: 0.2;
}

.payment-card {
  background-image: url('@/assets/images/menu/blue.png');
  background-size: cover;
  background-position: center;
  height: 300px;
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.invoice-card {
  background-image: url('@/assets/images/menu/purple.png');
  background-size: cover;
  background-position: center;
  height: 300px;
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.electronic-card {
  background-image: url('@/assets/images/menu/orange.png');
  background-size: cover;
  background-position: center;
  height: 300px;
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.intro-card {
  grid-column: 1 / 3;

  background-image: url('@/assets/images/menu/green.png');
  background-size: cover;
  background-position: center;
}

.hall-card {
  background-image: url('@/assets/images/menu/purple.png');
  background-size: cover;
  background-position: center;
}

.vehicle-card {
  background-image: url('@/assets/images/menu/orange.png');
  background-size: cover;
  background-position: center;
}

.faq-card {
  background-image: url('@/assets/images/menu/blue.png');
  background-size: cover;
  background-position: center;
}
.policy-card {
  background-image: url('@/assets/images/menu/red.png');
  background-size: cover;
  background-position: center;
}
</style>
