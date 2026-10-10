<script setup lang="ts">
definePage({
  meta: {
    title: '扫码开票',
  },
})

const { playText } = useSpeech()

const tipText = ref('请将业务单二维码朝下，置于屏幕下方的扫码区，听到“滴”声即完成扫描。')

onMounted(() => {
  playText(tipText.value)
})
</script>

<template>
  <div class="feature-page">
    <div class="page-content">
      <div class="qr-container-large">
        <div class="qr-code-large">
          <div class="qr-placeholder-large">
            <img src="@/assets/scan.gif" class="w-full h-full">
          </div>
        </div>
        <p class="qr-tip-large">
          {{ tipText }}
        </p>
        <div class="qr-info-large">
          <p>办理前，请备好您的业务单。</p>
          <p>请勿将手指或非业务单物品放入扫描区。</p>
          <p>如需帮助，请咨询工作人员。</p>
        </div>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.feature-page {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: center;
}

/* 主要内容区域 */
.page-content {
  flex: 1;
  overflow-y: auto;
  padding-right: 20px;
  margin-right: -20px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 30px 0;
}

.page-title {
  color: var(--v-color-primary);
  font-size: 32px;
  margin: 0 0 30px 0;
  font-weight: 800;
  background: linear-gradient(135deg, #003594 0%, #0066cc 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  text-align: center;
}

/* 扫码缴费内容 */
.qr-container-large {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 30px;
  background: white;
  border-radius: 15px;
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.15);
  max-width: 600px;
  width: 100%;
  margin-top: 20px;
}

.qr-code-large {
  width: 400px;
  height: 400px;
  background-color: white;
  border: 2px solid #f0f0f0;
  border-radius: 20px;
  display: flex;
  justify-content: center;
  align-items: center;
  margin: 0 0 30px 0;
  box-shadow: 0 12px 35px rgba(0, 0, 0, 0.1);
  transition: all 0.3s ease;
}

.qr-placeholder-large {
  width: 350px;
  height: 350px;
  background-color: #fafafa;
  border-radius: 15px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  gap: 30px;
  position: relative;
  overflow: hidden;
}

.qr-placeholder-large span {
  font-size: 24px;
  color:var(--v-color-primary);
  font-weight: 700;
  text-align: center;
}

.qr-tip-large {
  font-size: 20px;
  color: #333;
  font-weight: 600;
  margin: 0 0 25px 0;
  text-align: center;
}

.qr-info-large {
  display: flex;
  flex-direction: column;
  gap: 15px;
  background-color: #f8f9fa;
  padding: 25px;
  border-radius: 15px;
  width: 100%;
}

.qr-info-large p {
  font-size: 16px;
  color: #666;
  margin: 0;
  display: flex;
  align-items: center;
  gap: 10px;
}

@keyframes rotate {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
</style>
