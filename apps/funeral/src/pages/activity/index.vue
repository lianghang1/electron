<script setup lang="ts">
/**
 * 服务介绍：馆情简介 + 核心服务一览（静态内容）。
 */
const SERVICES = [
  {
    icon: 'car',
    name: '遗体接运',
    desc: '全程专人护送，市内各区随叫随到，夜间与节假日均正常受理。',
  },
  {
    icon: 'snow',
    name: '遗体冷藏',
    desc: '独立冷藏柜位，恒温保存、每日消毒，家属可按约定时间探视。',
  },
  {
    icon: 'hall',
    name: '告别厅服务',
    desc: '大、中、小告别厅齐备，司仪主持、鲜花布置、哀乐演奏可按需选配。',
  },
  {
    icon: 'flame',
    name: '火化服务',
    desc: '环保型火化炉分时段预约，家属可全程陪送，骨灰当日即可领取。',
  },
  {
    icon: 'box',
    name: '骨灰寄存',
    desc: '寄存楼恒温恒湿、双人双锁管理，寄存期满可续办或迁葬。',
  },
  {
    icon: 'cert',
    name: '证照办理',
    desc: '火化证、寄存证等证照现场办理，支持自助终端在线查询与打印。',
  },
]
</script>

<template>
  <div class="fh-page">
    <div class="fh-page-content fa-about">
      <!-- 馆情简介 -->
      <section class="fa-about__intro">
        <h3 class="fa-about__section-title">
          <span class="fa-about__title-bar" />
          馆情简介
        </h3>
        <p class="fa-about__text">
          本馆秉承“丧属至上、服务第一”的宗旨，为市民提供遗体接运、冷藏、告别、火化、骨灰寄存等
          一站式殡仪服务。馆区环境庄重肃穆，服务流程公开透明，收费项目明码标价。
        </p>
        <p class="fa-about__text">
          业务大厅设有自助服务终端，支持扫码缴费、发票开具、电子证照查询打印等业务，欢迎体验使用。
        </p>
      </section>

      <!-- 核心服务 -->
      <section>
        <h3 class="fa-about__section-title">
          <span class="fa-about__title-bar" />
          核心服务
        </h3>
        <div class="fa-about__grid">
          <div v-for="service in SERVICES" :key="service.name" class="fa-about__card">
            <span class="fa-about__icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
                <template v-if="service.icon === 'car'">
                  <path d="M3.5 13.5 5 8.8A2 2 0 0 1 6.9 7.5h10.2a2 2 0 0 1 1.9 1.3l1.5 4.7" />
                  <path d="M3.5 13.5h17v4a1 1 0 0 1-1 1h-1.5a1 1 0 0 1-1-1v-.8H7v.8a1 1 0 0 1-1 1H4.5a1 1 0 0 1-1-1v-4Z" />
                  <circle cx="7.5" cy="16" r="0.3" fill="currentColor" />
                  <circle cx="16.5" cy="16" r="0.3" fill="currentColor" />
                </template>
                <template v-else-if="service.icon === 'snow'">
                  <path d="M12 3v18M5 6.5l14 11M19 6.5l-14 11" />
                  <path d="M12 6.5 10 5M12 6.5l2-1.5M12 17.5 10 19M12 17.5l2 1.5" />
                </template>
                <template v-else-if="service.icon === 'hall'">
                  <path d="M4 20v-8l8-5.5 8 5.5v8" />
                  <path d="M2.5 20h19M12 3v3M9.5 20v-5h5v5" />
                </template>
                <template v-else-if="service.icon === 'flame'">
                  <path d="M12 3.5c2.8 3 5.5 5.8 5.5 9.5a5.5 5.5 0 0 1-11 0c0-2 .8-3.8 2.2-5.6.4 1 1 1.9 1.8 2.4 0-2.3.4-4.4 1.5-6.3Z" />
                </template>
                <template v-else-if="service.icon === 'box'">
                  <path d="M4.5 8h15v10.5a1 1 0 0 1-1 1h-13a1 1 0 0 1-1-1V8Z" />
                  <path d="M3.5 8 5 4.5h14L20.5 8M10 12h4" />
                </template>
                <template v-else>
                  <rect x="5" y="4" width="14" height="16" rx="1.5" />
                  <path d="M9 8.5h6M9 12h6M9 15.5h3.5" />
                </template>
              </svg>
            </span>
            <div class="fa-about__card-body">
              <h4 class="fa-about__card-name">
                {{ service.name }}
              </h4>
              <p class="fa-about__card-desc">
                {{ service.desc }}
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.fa-about {
  display: flex;
  flex-direction: column;
  padding: 28px 36px;
}

.fa-about__section-title {
  display: flex;
  align-items: center;
  margin: 0 0 16px;
  font-size: 19px;
  font-weight: 700;
  color: var(--fh-text);
}

.fa-about__intro {
  margin-bottom: 30px;
}

.fa-about__title-bar {
  width: 4px;
  height: 18px;
  border-radius: 2px;
  background: var(--fh-gold);
  margin-right: 10px;
}

.fa-about__text {
  margin: 0 0 10px;
  font-size: 16px;
  line-height: 1.9;
  color: var(--fh-text-2);
  text-indent: 2em;
}

/* ---- 服务卡 ---- */

.fa-about__grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
}

.fa-about__card {
  display: flex;
  align-items: flex-start;
  border: 1px solid var(--fh-line);
  border-radius: var(--fh-radius);
  background: var(--fh-surface-2);
  padding: 18px 20px;
  margin: 0 14px 14px 0;
}

.fa-about__card:nth-child(3n) {
  margin-right: 0;
}

.fa-about__icon {
  width: 46px;
  height: 46px;
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--fh-gold-soft);
  border-radius: var(--fh-radius-sm);
}

.fa-about__icon svg {
  width: 24px;
  height: 24px;
  color: var(--fh-gold);
}

.fa-about__card-body {
  min-width: 0;
  margin-left: 14px;
}

.fa-about__card-name {
  margin: 0 0 6px;
  font-size: 16px;
  font-weight: 700;
  color: var(--fh-text);
}

.fa-about__card-desc {
  margin: 0;
  font-size: 14px;
  line-height: 1.7;
  color: var(--fh-text-2);
}
</style>
