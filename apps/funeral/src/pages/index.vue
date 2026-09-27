<script setup lang="ts">
import { useRouter } from 'vue-router'

interface ModuleCard {
  path: string
  title: string
  desc: string
  icon: string
}

const router = useRouter()

// 任务驱动布局：主任务全宽大卡 + 办理类宽卡 + 查询类卡 + 低频信息压底条（行业自助终端通行模式）
const PRIMARY = { path: '/payment', title: '业务缴费', desc: '扫码或刷身份证查询待缴费用，扫码支付后自动打印凭条', icon: 'pay' }

// 办理类：横向宽卡（打印/办理动线）
const TASKS: ModuleCard[] = [
  { path: '/invoice', title: '发票服务', desc: '扫码开具 / 打印发票', icon: 'invoice' },
  { path: '/electronic', title: '电子证照', desc: '火化证明在线查询打印', icon: 'cert' },
]

// 查询选购类：竖卡
const SERVICES: ModuleCard[] = [
  { path: '/retail', title: '丧葬用品', desc: '自助选购结算', icon: 'bag' },
  { path: '/hall', title: '礼厅班次', desc: '礼厅预定情况查询', icon: 'hall' },
  { path: '/cremation', title: '火化班次', desc: '火化炉排班查询', icon: 'flame' },
]

const FOOTER_LINKS: ModuleCard[] = [
  { path: '/activity', title: '服务介绍', desc: '', icon: 'about' },
  { path: '/policy', title: '惠民政策', desc: '', icon: 'policy' },
  { path: '/faq', title: '常见问题', desc: '', icon: 'faq' },
]

const PRIMARY_TAGS = ['扫码支付', '证件查询', '电子发票']
</script>

<template>
  <div class="fh-home">
    <!-- 主任务卡：业务缴费 -->
    <button class="fh-home__primary" @click="router.push(PRIMARY.path)">
      <span class="fh-home__primary-icon">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <use :href="`#fh-icon-${PRIMARY.icon}`" />
        </svg>
      </span>
      <span class="fh-home__primary-body">
        <span class="fh-home__primary-title">{{ PRIMARY.title }}</span>
        <span class="fh-home__primary-desc">{{ PRIMARY.desc }}</span>
        <span class="fh-home__primary-tags">
          <i v-for="tag in PRIMARY_TAGS" :key="tag">{{ tag }}</i>
        </span>
      </span>
      <span class="fh-home__primary-go">
        立即办理
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path d="M6 3.5 10.5 8 6 12.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </span>
    </button>

    <!-- 办理类宽卡：横向布局，一排 2 个 -->
    <div class="fh-home__grid fh-home__grid--tasks">
      <button
        v-for="item in TASKS"
        :key="item.path"
        class="fh-module fh-module--wide"
        @click="router.push(item.path)"
      >
        <span class="fh-module__icon">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <use :href="`#fh-icon-${item.icon}`" />
          </svg>
        </span>
        <span class="fh-module__text">
          <span class="fh-module__title">{{ item.title }}</span>
          <span class="fh-module__desc">{{ item.desc }}</span>
        </span>
        <span class="fh-module__arrow" aria-hidden="true">
          <svg viewBox="0 0 16 16">
            <path d="M6 3.5 10.5 8 6 12.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </span>
      </button>
    </div>

    <!-- 查询选购类卡：一排 3 个 -->
    <div class="fh-home__grid fh-home__grid--services">
      <button
        v-for="item in SERVICES"
        :key="item.path"
        class="fh-module"
        @click="router.push(item.path)"
      >
        <span class="fh-module__icon">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <use :href="`#fh-icon-${item.icon}`" />
          </svg>
        </span>
        <span class="fh-module__title">{{ item.title }}</span>
        <span class="fh-module__desc">{{ item.desc }}</span>
      </button>
    </div>

    <!-- 低频信息条 -->
    <nav class="fh-home__links">
      <button
        v-for="item in FOOTER_LINKS"
        :key="item.path"
        class="fh-home__link"
        @click="router.push(item.path)"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <use :href="`#fh-icon-${item.icon}`" />
        </svg>
        {{ item.title }}
      </button>
    </nav>

    <!-- 图标 symbol 定义：线性风格，与蓝白体系一致 -->
    <svg width="0" height="0" style="position: absolute" aria-hidden="true">
      <defs>
        <g id="fh-icon-pay" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="6" width="18" height="12" rx="2" />
          <circle cx="12" cy="12" r="2.6" />
          <path d="M6.5 9.2v.01M17.5 14.8v.01" />
        </g>
        <g id="fh-icon-invoice" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M7 8V4h10v4" />
          <rect x="4" y="8" width="16" height="8" rx="1.5" />
          <path d="M7 13v7h10v-7M7 17h10" />
        </g>
        <g id="fh-icon-cert" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="9" r="5" />
          <path d="M9.5 13.2 8 21l4-2.2L16 21l-1.5-7.8" />
          <path d="M10 9l1.4 1.4L14 7.8" />
        </g>
        <g id="fh-icon-bag" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M5.5 8h13l-1 12.5h-11L5.5 8Z" />
          <path d="M9 10.5V7a3 3 0 0 1 6 0v3.5" />
        </g>
        <g id="fh-icon-hall" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <rect x="4" y="5" width="16" height="15" rx="1.5" />
          <path d="M4 9.5h16M8 5v15M12 13h4" />
        </g>
        <g id="fh-icon-flame" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 3.5c.6 2.6-.5 3.9-1.9 5.4-1.2 1.3-2.4 2.8-2.4 5.2a6.3 6.3 0 0 0 12.6 0c0-1.7-.7-3.1-1.6-4.3-.4 1-1 1.7-1.9 2.2.3-3.4-1.6-6.7-4.8-8.5Z" />
        </g>
        <g id="fh-icon-faq" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v8a2.5 2.5 0 0 1-2.5 2.5H12l-4.5 3.5V17H6.5A2.5 2.5 0 0 1 4 14.5v-8Z" />
          <path d="M9.8 9.2A2.3 2.3 0 0 1 14.3 10c0 1.4-2.2 1.6-2.2 3M12.1 15.4v.01" />
        </g>
        <g id="fh-icon-policy" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M6 3.5h9l3.5 3.5v13.5h-12.5V3.5Z" />
          <path d="M9 9h6M9 12.5h6M9 16h4" />
        </g>
        <g id="fh-icon-about" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M4 20.5h16M6 20.5V5.8A1.8 1.8 0 0 1 7.8 4h8.4A1.8 1.8 0 0 1 18 5.8v14.7" />
          <path d="M9.5 8h5M9.5 11.5h5M9.5 15h5" />
        </g>
      </defs>
    </svg>
  </div>
</template>

<style scoped>
.fh-home {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 4px 8px 0;
}

/* ---- 主任务卡：业务缴费（全宽，最高视觉权重） ---- */

.fh-home__primary {
  flex: none;
  display: flex;
  align-items: center;
  padding: 0 44px 0 40px;
  background: linear-gradient(135deg, #ffffff 0%, rgb(240 246 255 / 92%) 100%);
  border: 2px solid rgb(36 86 184 / 38%);
  border-radius: var(--fh-radius-lg);
  box-shadow: var(--fh-shadow-card);
  font-family: inherit;
  text-align: left;
  cursor: pointer;
  transition: transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease;
}

.fh-home__primary:hover {
  border-color: var(--fh-ink);
  box-shadow: var(--fh-shadow-float);
  transform: translateY(-2px);
}

.fh-home__primary:active {
  transform: translateY(0) scale(0.99);
}

.fh-home__primary-icon {
  flex: none;
  width: 104px;
  height: 104px;
  margin: 22px 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: linear-gradient(160deg, var(--fh-cta-from) 0%, var(--fh-cta-to) 100%);
  color: #fff;
  box-shadow: 0 10px 24px rgb(36 86 184 / 30%);
}

.fh-home__primary-icon svg {
  width: 52px;
  height: 52px;
}

.fh-home__primary-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  margin-left: 36px;
}

.fh-home__primary-title {
  font-family: var(--fh-font-serif);
  font-size: 32px;
  font-weight: 700;
  letter-spacing: 4px;
  color: var(--fh-text);
}

.fh-home__primary-desc {
  margin-top: 8px;
  font-size: 16px;
  color: var(--fh-text-2);
}

.fh-home__primary-tags {
  display: flex;
  margin-top: 12px;
}

.fh-home__primary-tags i {
  font-style: normal;
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 1px;
  color: var(--fh-ink);
  background: rgb(36 86 184 / 8%);
  border: 1px solid rgb(36 86 184 / 22%);
  border-radius: 999px;
  padding: 3px 14px;
  margin-right: 10px;
}

.fh-home__primary-go {
  flex: none;
  display: inline-flex;
  align-items: center;
  height: 60px;
  padding: 0 38px;
  border-radius: 999px;
  background: linear-gradient(160deg, var(--fh-cta-from) 0%, var(--fh-cta-to) 100%);
  color: var(--fh-cta-ink);
  font-size: 19px;
  font-weight: 700;
  letter-spacing: 3px;
  box-shadow: 0 8px 20px rgb(36 86 184 / 28%);
  transition: filter 0.15s ease;
}

.fh-home__primary:hover .fh-home__primary-go {
  filter: brightness(1.07);
}

.fh-home__primary-go svg {
  width: 16px;
  height: 16px;
  margin-left: 10px;
}

/* ---- 次任务区：办理类宽卡 + 查询类卡，共同撑满剩余高度 ---- */

.fh-home__grid {
  min-height: 0;
  margin: 16px -14px 0 0; /* 抵消末列右 margin */
}

.fh-home__grid--tasks {
  flex: 5;
  display: grid;
  grid-template-columns: repeat(2, 1fr);
}

.fh-home__grid--services {
  flex: 6;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
}

/* 查询类竖卡：内容纵向排列 */
.fh-home__grid--services .fh-module {
  flex-direction: column;
}

.fh-module {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-right: 14px;
  padding: 20px 32px;
  background: rgb(255 255 255 / 90%);
  border: 1px solid var(--fh-line);
  border-radius: var(--fh-radius-lg);
  box-shadow: var(--fh-shadow-card);
  font-family: inherit;
  text-align: center;
  cursor: pointer;
  transition: transform 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease, background 0.15s ease;
}

.fh-module:hover {
  transform: translateY(-3px);
  border-color: rgb(36 86 184 / 45%);
  background: #ffffff;
  box-shadow: var(--fh-shadow-float);
}

.fh-module:active {
  transform: translateY(0) scale(0.98);
}

/* 办理类宽卡：横向布局 */
.fh-module--wide {
  justify-content: flex-start;
  text-align: left;
  padding: 20px 40px;
}

.fh-module__text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  margin-left: 30px;
}

.fh-module--wide .fh-module__title {
  margin-top: 0;
}

.fh-module--wide .fh-module__desc {
  margin-top: 8px;
}

.fh-module__arrow {
  flex: none;
  width: 44px;
  height: 44px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: rgb(36 86 184 / 8%);
  color: var(--fh-ink);
  transition: background 0.15s ease, color 0.15s ease;
}

.fh-module__arrow svg {
  width: 18px;
  height: 18px;
}

.fh-module--wide:hover .fh-module__arrow {
  background: var(--fh-ink);
  color: #fff;
}

.fh-module__icon {
  width: 84px;
  height: 84px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: rgb(36 86 184 / 10%);
  border: 1px solid rgb(36 86 184 / 24%);
  color: var(--fh-ink);
  transition: transform 0.15s ease;
}

.fh-module__icon svg {
  width: 42px;
  height: 42px;
}

.fh-module:hover .fh-module__icon {
  transform: scale(1.06);
}

.fh-module__title {
  margin-top: 18px;
  font-family: var(--fh-font-serif);
  font-size: 25px;
  font-weight: 700;
  letter-spacing: 3px;
  color: var(--fh-text);
}

.fh-module__desc {
  margin-top: 8px;
  font-size: 14px;
  color: var(--fh-text-2);
}

/* ---- 低频信息条 ---- */

.fh-home__links {
  flex: none;
  display: flex;
  margin: 16px 0 0;
  background: rgb(255 255 255 / 78%);
  border: 1px solid var(--fh-line);
  border-radius: var(--fh-radius);
  overflow: hidden;
}

.fh-home__link {
  flex: 1;
  height: 64px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-right: 1px solid var(--fh-line);
  background: none;
  font-family: inherit;
  font-size: 17px;
  font-weight: 600;
  letter-spacing: 2px;
  color: var(--fh-text-2);
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;
}

.fh-home__link:last-child {
  border-right: none;
}

.fh-home__link:hover {
  background: rgb(36 86 184 / 6%);
  color: var(--fh-ink);
}

.fh-home__link:active {
  background: rgb(36 86 184 / 12%);
}

.fh-home__link svg {
  width: 20px;
  height: 20px;
  margin-right: 10px;
}

/* ---- 图标 symbol 容器隐藏 ---- */

.fh-home > svg[style] {
  display: none;
}
</style>
