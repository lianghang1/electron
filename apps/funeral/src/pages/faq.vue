<script setup lang="ts">
import { ref } from 'vue'

/**
 * 常见问题解答：手风琴式静态问答。
 */
const FAQS = [
  {
    q: '办理殡仪业务需要携带哪些证件？',
    a: '请经办人携带本人身份证、逝者身份证（或户口簿）及死亡证明。正常死亡由医疗卫生机构出具《居民死亡医学证明（推断）书》，非正常死亡由公安部门出具相关证明。',
  },
  {
    q: '如何查询待缴费项目并完成缴费？',
    a: '在首页选择「业务缴费」，将业务单二维码朝下放入扫码区，或输入逝者身份证号码查询。系统会列出全部待缴明细，确认无误后使用微信或支付宝扫码支付，凭条自动打印。',
  },
  {
    q: '缴费后如何开具电子发票？',
    a: '在首页选择「扫码开票」，扫描业务单二维码即可查看该业务单全部发票。已缴费用可按个人或单位抬头申请开票，企业抬头需填写税号，开票完成后可直接打印。',
  },
  {
    q: '火化证、骨灰寄存证如何领取？',
    a: '火化完成后由业务大厅发放纸质证照。您也可以在首页选择「电子火化证」，扫码或输入逝者身份证号查询电子版，并直接在本机打印。',
  },
  {
    q: '骨灰寄存期限是多久？期满如何续办？',
    a: '骨灰寄存以一年为周期，期满前可到业务大厅或自助终端办理续费。逾期未续办的，我们将电话联系登记的经办人，请您保持通讯畅通。',
  },
  {
    q: '告别厅如何预约？可以自选布置吗？',
    a: '告别厅按场次预约，可在「礼厅预定情况」中查看近三天的空闲时段。鲜花、横幅、哀乐等布置项目请在办理业务时向工作人员说明，我们将按您的需求安排。',
  },
]

const activeIndex = ref(0)

function toggle(index: number): void {
  activeIndex.value = activeIndex.value === index ? -1 : index
}
</script>

<template>
  <div class="fh-page">
    <div class="fh-page-content fa-faq">
      <div
        v-for="(item, index) in FAQS"
        :key="index"
        class="fa-faq__item"
        :class="{ 'is-open': activeIndex === index }"
      >
        <button class="fa-faq__question" @click="toggle(index)">
          <span class="fa-faq__q-text">{{ item.q }}</span>
          <svg class="fa-faq__arrow" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <path d="M4 6l4 4 4-4" />
          </svg>
        </button>
        <div v-show="activeIndex === index" class="fa-faq__answer">
          {{ item.a }}
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.fa-faq {
  padding: 24px 36px;
}

.fa-faq__item {
  border: 1px solid var(--fh-line);
  border-radius: var(--fh-radius);
  background: var(--fh-surface);
  margin-bottom: 14px;
  overflow: hidden;
  transition: border-color 0.15s ease;
}

.fa-faq__item.is-open {
  border-color: var(--fh-gold);
}

.fa-faq__question {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border: none;
  background: none;
  padding: 18px 22px;
  font-family: inherit;
  font-size: 17px;
  font-weight: 600;
  color: var(--fh-text);
  text-align: left;
  cursor: pointer;
}

.fa-faq__arrow {
  width: 18px;
  height: 18px;
  flex: none;
  color: var(--fh-text-3);
  transition: transform 0.2s ease;
}

.is-open .fa-faq__arrow {
  transform: rotate(180deg);
}

.fa-faq__answer {
  padding: 0 22px 20px;
  font-size: 15px;
  line-height: 1.9;
  color: var(--fh-text-2);
}
</style>
