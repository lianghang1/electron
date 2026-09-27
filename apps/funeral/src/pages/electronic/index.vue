<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { fh } from '../../api/fh'
import FhModal from '../../components/FhModal.vue'
import FhQueryPanel from '../../components/FhQueryPanel.vue'
import { playSpeech } from '../../composables/use-speech'

/**
 * 电子火化证入口：扫码（全局分发）或证件号查单，命中后进证照详情。
 */
const router = useRouter()

const modalVisible = ref(false)
const modalMessage = ref('')

async function handleQuery(value: string): Promise<void> {
  const businessId = await fh.getBusinessIdByDeadCert(value)
  if (!businessId) {
    modalMessage.value = '未查询到业务记录'
    modalVisible.value = true
    void playSpeech('未查询到业务记录，请检查证件号码是否正确')
    return
  }
  router.push({
    path: '/electronic/detail',
    query: { businessId, businessType: '5' },
  })
}
</script>

<template>
  <div class="fh-page">
    <div class="fh-page-content fh-query-page">
      <FhQueryPanel
        scan-voice="请将业务单二维码朝下，置于屏幕下方的扫码区，听到滴声即完成扫描。"
        idcard-voice="请输入逝者身份证号码查询业务记录"
        @query="handleQuery"
      />
    </div>
    <FhModal v-model:visible="modalVisible" type="info" :message="modalMessage" />
  </div>
</template>
