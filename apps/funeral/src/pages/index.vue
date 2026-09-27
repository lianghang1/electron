<script setup lang="ts">
import { useRouter } from 'vue-router'

interface ModuleCard {
  path: string
  title: string
  desc: string
  icon: string
  /** 主推卡（鎏金描边强调） */
  primary?: boolean
}

const router = useRouter()

// 9 张等大卡 3×3 九宫格（业务缴费金色描边强调）
const MODULES: ModuleCard[] = [
  { path: '/payment', title: '业务缴费', desc: '扫码或身份证查询，快速完成缴费', icon: 'pay', primary: true },
  { path: '/invoice', title: '扫码开票', desc: '便捷开票，无需等待', icon: 'invoice' },
  { path: '/electronic', title: '电子火化证', desc: '在线查询与打印证照', icon: 'cert' },
  { path: '/retail', title: '丧葬用品', desc: '自助选购，品质保证', icon: 'bag' },
  { path: '/hall', title: '礼厅预定情况', desc: '查询礼厅预定状态', icon: 'hall' },
  { path: '/cremation', title: '火化预定情况', desc: '查询火化炉排班', icon: 'flame' },
  { path: '/faq', title: '常见问题解答', desc: '办事流程常见疑问', icon: 'faq' },
  { path: '/policy', title: '惠民政策', desc: '了解相关惠民政策', icon: 'policy' },
  { path: '/activity', title: '服务介绍', desc: '馆情简介与核心服务', icon: 'about' },
]

let serial = 0

function nextSerial(): string {
  serial += 1
  return String(serial).padStart(2, '0')
}
</script>

<template>
  <div class="fh-home">
    <div class="fh-home__hero">
      <div class="fh-home__hero-rule" aria-hidden="true">
        <i class="fh-home__hero-line" />
        <i class="fh-home__hero-diamond" />
        <i class="fh-home__hero-line" />
      </div>
      <h2 class="fh-home__hero-title">
        智能自助服务系统
      </h2>
      <p class="fh-home__hero-desc">
        为您提供便捷、高效、有温度的服务体验
      </p>
    </div>

    <div class="fh-home__grid">
      <button
        v-for="item in MODULES"
        :key="item.path"
        class="fh-module"
        :class="{ 'fh-module--primary': item.primary }"
        @click="router.push(item.path)"
      >
        <span class="fh-module__serial">{{ nextSerial() }}</span>
        <span class="fh-module__icon">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <use :href="`#fh-icon-${item.icon}`" />
          </svg>
        </span>
        <span class="fh-module__title">{{ item.title }}</span>
        <span class="fh-module__desc">{{ item.desc }}</span>
        <span v-if="item.primary" class="fh-module__go">
          点击进入
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="M6 3.5 10.5 8 6 12.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </span>
      </button>
    </div>

    <!-- 图标 symbol 定义：线性风格，与玄蓝/鎏金体系一致 -->
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

/* ---- 欢迎区：线 · 菱 · 线 中式对称装饰 ---- */

.fh-home__hero {
  flex: none;
  text-align: center;
  padding: 8px 0 16px;
}

.fh-home__hero-rule {
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 12px;
}

.fh-home__hero-line {
  width: 120px;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgb(214 178 118 / 80%));
}

.fh-home__hero-line:last-child {
  background: linear-gradient(270deg, transparent, rgb(214 178 118 / 80%));
}

.fh-home__hero-diamond {
  width: 7px;
  height: 7px;
  background: var(--fh-gold-bright);
  transform: rotate(45deg);
  margin: 0 14px;
}

.fh-home__hero-title {
  margin: 0;
  font-family: var(--fh-font-serif);
  font-size: 33px;
  font-weight: 700;
  letter-spacing: 10px;
  text-indent: 10px; /* 抵消末字间距，保持视觉居中 */
  color: #fff;
}

.fh-home__hero-desc {
  margin: 8px 0 0;
  font-size: 15px;
  letter-spacing: 3px;
  color: rgb(255 255 255 / 78%);
}

/* ---- 模块网格：3×3 等大九宫格，撑满不滚动 ---- */

.fh-home__grid {
  flex: 1;
  min-height: 0;
  width: 100%;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  grid-template-rows: repeat(3, 1fr);
  margin-right: -14px; /* 抵消末列右 margin */
}

.fh-module {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  margin: 0 14px 14px 0;
  padding: 16px 24px;
  background: rgb(255 255 255 / 88%);
  border: 1px solid var(--fh-line);
  border-radius: var(--fh-radius-lg);
  box-shadow: var(--fh-shadow-card);
  font-family: inherit;
  text-align: center;
  cursor: pointer;
  transition: transform 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease, background 0.18s ease;
}

.fh-module:hover {
  transform: translateY(-3px);
  border-color: rgb(36 86 184 / 45%);
  background: rgb(255 255 255 / 96%);
  box-shadow: var(--fh-shadow-float);
}

.fh-module:active {
  transform: translateY(-1px);
}

/* ---- 衬线序号（鎏金） ---- */

.fh-module__serial {
  position: absolute;
  top: 12px;
  right: 16px;
  font-family: var(--fh-font-serif);
  font-size: 14px;
  font-weight: 600;
  letter-spacing: 1px;
  color: rgb(168 130 60 / 60%);
  font-variant-numeric: tabular-nums;
}

/* ---- 卡内容 ---- */

.fh-module__icon {
  width: 64px;
  height: 64px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: rgb(36 86 184 / 12%);
  border: 1px solid rgb(36 86 184 / 26%);
  color: var(--fh-ink);
  transition: transform 0.18s ease;
}

.fh-module__icon svg {
  width: 32px;
  height: 32px;
}

.fh-module:hover .fh-module__icon {
  transform: scale(1.08);
}

.fh-module__title {
  margin-top: 14px;
  font-family: var(--fh-font-serif);
  font-size: 21px;
  font-weight: 700;
  letter-spacing: 3px;
  color: var(--fh-text);
}

.fh-module__desc {
  margin-top: 6px;
  font-size: 13.5px;
  color: var(--fh-text-2);
}

/* ---- 主推卡（业务缴费，鎏金强调） ---- */

.fh-module--primary {
  background: rgb(255 255 255 / 92%);
  border-color: rgb(36 86 184 / 42%);
}

.fh-module--primary:hover {
  border-color: var(--fh-ink);
  background: #ffffff;
}

.fh-module--primary .fh-module__icon {
  width: 72px;
  height: 72px;
  background: rgb(36 86 184 / 10%);
  border-color: rgb(36 86 184 / 40%);
  color: var(--fh-ink);
}

.fh-module--primary .fh-module__icon svg {
  width: 36px;
  height: 36px;
}

.fh-module--primary .fh-module__serial {
  color: var(--fh-gold-deep);
}

.fh-module__go {
  display: inline-flex;
  align-items: center;
  margin-top: 12px;
  padding: 6px 16px;
  border: 1px solid rgb(36 86 184 / 42%);
  border-radius: 999px;
  color: var(--fh-ink);
  font-size: 13px;
  letter-spacing: 2px;
  transition: background 0.18s ease;
}

.fh-module__go svg {
  width: 12px;
  height: 12px;
  margin-left: 6px;
}

.fh-module--primary:hover .fh-module__go {
  background: rgb(36 86 184 / 10%);
}
</style>
