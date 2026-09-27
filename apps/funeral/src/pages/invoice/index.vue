<script setup lang="ts">
import FhQueryPanel from '../../components/FhQueryPanel.vue'

/**
 * 扫码开票入口：纯扫码引导，扫码识别由全局扫码流分发到发票清单页。
 */
</script>

<template>
  <div class="fh-page">
    <div class="fh-page-content fh-query-page">
      <FhQueryPanel
        scan-only
        scan-voice="请将业务单二维码朝下，置于屏幕下方的扫码区，完成扫描后将自动展示发票信息。"
        :scan-tips="[
          '办理前，请备好您的业务单',
          '扫码后将展示该业务单的全部发票',
          '如需帮助，请咨询工作人员',
        ]"
      />
    </div>
  </div>
</template>
