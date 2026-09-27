<script setup lang="ts">
import { ref } from 'vue'

/**
 * 惠民政策：惠民政策 + 办事指南双 Tab 静态内容。
 */
const activeTab = ref<'policy' | 'guide'>('policy')

const POLICIES = [
  {
    name: '困难群众殡葬费用减免',
    desc: '城乡低保对象、特困供养人员、重点优抚对象等，凭有效证件可减免基本殡仪服务费用（含遗体接运、冷藏三日、火化等基本项目）。',
  },
  {
    name: '节地生态安葬奖补',
    desc: '选择骨灰海葬、树葬、花坛葬等不占或少占地生态安葬方式的，按当地民政部门标准给予一次性奖补，办理时请携带申请人身份证及骨灰寄存证。',
  },
  {
    name: '惠民鲜花告别服务',
    desc: '我馆定期开展鲜花告别惠民活动，中、小告别厅可享受基础鲜花布置优惠，具体活动以业务大厅当期公告为准。',
  },
  {
    name: '免费便民服务',
    desc: '业务大厅免费提供轮椅、老花镜、饮用水、复印打印等服务；自助终端可免费查询缴费、开具发票、打印证照。',
  },
]

const GUIDE_STEPS = [
  {
    step: '01',
    name: '开具死亡证明',
    desc: '在医疗卫生机构或公安部门办理《居民死亡医学证明（推断）书》。',
  },
  {
    step: '02',
    name: '预约遗体接运',
    desc: '携带死亡证明及双方身份证到业务大厅办理，或电话预约接运车辆。',
  },
  {
    step: '03',
    name: '办理殡仪业务',
    desc: '确认冷藏、告别厅、火化等服务项目与时间，签署服务确认单。',
  },
  {
    step: '04',
    name: '举行告别仪式',
    desc: '按预约场次到告别厅主持告别，鲜花、司仪等服务可提前选配。',
  },
  {
    step: '05',
    name: '火化与领取骨灰',
    desc: '火化结束后领取骨灰及火化证，可当场办理骨灰寄存或迁葬。',
  },
]
</script>

<template>
  <div class="fh-page">
    <div class="fh-page-content fa-policy">
      <div class="fa-policy__tabs">
        <button
          class="fa-policy__tab"
          :class="{ 'is-active': activeTab === 'policy' }"
          @click="activeTab = 'policy'"
        >
          惠民政策
        </button>
        <button
          class="fa-policy__tab"
          :class="{ 'is-active': activeTab === 'guide' }"
          @click="activeTab = 'guide'"
        >
          办事指南
        </button>
      </div>

      <!-- 惠民政策 -->
      <div v-show="activeTab === 'policy'" class="fa-policy__list">
        <div v-for="item in POLICIES" :key="item.name" class="fa-policy__card">
          <h4 class="fa-policy__name">
            {{ item.name }}
          </h4>
          <p class="fa-policy__desc">
            {{ item.desc }}
          </p>
        </div>
        <p class="fa-policy__note">
          以上政策以当地民政部门最新规定为准，详情请咨询业务大厅工作人员或致电服务热线。
        </p>
      </div>

      <!-- 办事指南 -->
      <div v-show="activeTab === 'guide'" class="fa-policy__guide">
        <div v-for="step in GUIDE_STEPS" :key="step.step" class="fa-policy__step">
          <div class="fa-policy__step-index">
            {{ step.step }}
          </div>
          <div class="fa-policy__step-body">
            <h4 class="fa-policy__step-name">
              {{ step.name }}
            </h4>
            <p class="fa-policy__step-desc">
              {{ step.desc }}
            </p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.fa-policy {
  display: flex;
  flex-direction: column;
  padding: 24px 36px;
}

.fa-policy__tabs {
  display: flex;
  flex: none;
  margin-bottom: 20px;
}

.fa-policy__tab {
  width: 150px;
  height: 46px;
  border: 1px solid var(--fh-line-strong);
  background: var(--fh-surface);
  color: var(--fh-text-2);
  font-family: inherit;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease;
}

.fa-policy__tab:first-child {
  border-radius: var(--fh-radius-sm) 0 0 var(--fh-radius-sm);
}

.fa-policy__tab:last-child {
  border-radius: 0 var(--fh-radius-sm) var(--fh-radius-sm) 0;
  border-left: none;
}

.fa-policy__tab.is-active {
  background: var(--fh-ink);
  border-color: var(--fh-ink);
  color: #fff;
}

/* ---- 惠民政策 ---- */

.fa-policy__list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}

.fa-policy__card {
  border: 1px solid var(--fh-line);
  border-left: 3px solid var(--fh-gold);
  border-radius: 0 var(--fh-radius) var(--fh-radius) 0;
  background: var(--fh-surface-2);
  padding: 18px 22px;
  margin-bottom: 14px;
}

.fa-policy__name {
  margin: 0 0 8px;
  font-size: 17px;
  font-weight: 700;
  color: var(--fh-text);
}

.fa-policy__desc {
  margin: 0;
  font-size: 15px;
  line-height: 1.8;
  color: var(--fh-text-2);
}

.fa-policy__note {
  margin: 4px 0 0;
  font-size: 13px;
  color: var(--fh-text-3);
}

/* ---- 办事指南 ---- */

.fa-policy__guide {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}

.fa-policy__step {
  display: flex;
  align-items: flex-start;
  position: relative;
  padding-bottom: 24px;
}

.fa-policy__step:last-child {
  padding-bottom: 0;
}

.fa-policy__step::before {
  content: '';
  position: absolute;
  left: 21px;
  top: 46px;
  bottom: 2px;
  width: 1px;
  background: var(--fh-line-strong);
}

.fa-policy__step:last-child::before {
  display: none;
}

.fa-policy__step-index {
  width: 42px;
  height: 42px;
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: var(--fh-gold-soft);
  border: 1px solid var(--fh-gold);
  color: var(--fh-gold);
  font-size: 15px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.fa-policy__step-body {
  margin-left: 16px;
  padding-top: 4px;
}

.fa-policy__step-name {
  margin: 0 0 4px;
  font-size: 17px;
  font-weight: 700;
  color: var(--fh-text);
}

.fa-policy__step-desc {
  margin: 0;
  font-size: 15px;
  line-height: 1.7;
  color: var(--fh-text-2);
}
</style>
