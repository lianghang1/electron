<script setup lang="ts">
import { useAsarUpdateState, useUpdateState } from '../composables/use-update'

const { state } = useUpdateState()
const { state: asar } = useAsarUpdateState()

async function install() {
  await window.desktop.update.install()
}
</script>

<template>
  <!-- 底部 asar 热更横幅：pending = 重启应用生效（install 统一入口，asar pending 优先） -->
  <Transition name="upd">
    <div v-if="asar && !['idle', 'checking'].includes(asar.status)" class="upd-banner">
      <span class="upd-dot" :class="{ 'upd-dot--error': asar.status === 'error' }" />
      <div class="upd-info">
        <span class="upd-title">软件更新</span>
        <span class="upd-desc">
          <template v-if="asar.status === 'downloading'">正在下载 {{ asar.version }} {{ asar.percent !== undefined && asar.percent >= 0 ? `${Math.floor(asar.percent)}%` : '' }}</template>
          <template v-else-if="asar.status === 'pending'">新版本 {{ asar.version }} 已就绪，重启应用生效</template>
          <template v-else-if="asar.status === 'blocked'">已检测到新版本 {{ asar.version }}，需整包更新后生效</template>
          <template v-else-if="asar.status === 'error'">热更包下载失败：{{ asar.message ?? '未知错误' }}</template>
        </span>
      </div>
      <div v-if="asar.status === 'downloading' && asar.percent !== undefined && asar.percent >= 0" class="upd-track">
        <div class="upd-bar" :style="{ width: `${Math.floor(asar.percent)}%` }" />
      </div>
      <button v-if="asar.status === 'pending'" class="upd-btn" @click="install">
        重启更新
      </button>
    </div>
  </Transition>
  <!-- 底部整包更新横幅：仅在有实质状态（检查中不占位）时出现，样式与权限/下载横幅一致 -->
  <Transition name="upd">
    <div
      v-if="state && !['idle', 'checking', 'not-available'].includes(state.status)"
      class="upd-banner"
    >
      <span class="upd-dot" :class="`upd-dot--${state.status}`" />
      <div class="upd-info">
        <span class="upd-title">软件更新</span>
        <span class="upd-desc">
          <template v-if="state.status === 'available'">发现新版本 {{ state.version }}，正在下载…</template>
          <template v-else-if="state.status === 'downloading'">正在下载 {{ state.percent !== undefined ? `${Math.floor(state.percent)}%` : '' }}</template>
          <template v-else-if="state.status === 'downloaded'">新版本 {{ state.version }} 已就绪，重启后完成安装</template>
          <template v-else-if="state.status === 'error'">更新失败：{{ state.message ?? '未知错误' }}</template>
        </span>
      </div>
      <div v-if="state.status === 'downloading' && state.percent !== undefined" class="upd-track">
        <div class="upd-bar" :style="{ width: `${Math.floor(state.percent)}%` }" />
      </div>
      <button v-if="state.status === 'downloaded'" class="upd-btn" @click="install">
        重启更新
      </button>
    </div>
  </Transition>
</template>

<style scoped>
.upd-banner {
  flex: none;
  display: flex;
  align-items: center;
  height: 44px;
  padding: 0 8px;
  background: transparent;
}
.upd-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  margin-right: 12px;
  flex: none;
  background: var(--dt-brand);
}
.upd-dot--downloaded {
  background: var(--dt-success);
}
.upd-dot--error {
  background: var(--dt-danger);
}
.upd-info {
  flex: none;
  display: flex;
  align-items: baseline;
}
.upd-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--dt-text);
  margin-right: 12px;
}
.upd-desc {
  font-size: 12px;
  color: var(--dt-text-2);
}
.upd-track {
  flex: 1;
  height: 4px;
  margin-left: 16px;
  border-radius: 2px;
  background: var(--dt-hover);
  overflow: hidden;
}
.upd-bar {
  height: 100%;
  border-radius: 2px;
  background: var(--dt-brand);
  transition: width 0.3s var(--dt-ease);
}
.upd-btn {
  flex: none;
  height: 28px;
  padding: 0 16px;
  margin-left: 16px;
  border: none;
  border-radius: var(--dt-radius-1);
  background: var(--dt-brand);
  color: var(--dt-brand-on);
  font-size: 12px;
  font-weight: 500;
  font-family: inherit;
  cursor: pointer;
  transition: background var(--dt-dur) var(--dt-ease);
}
.upd-btn:hover {
  background: var(--dt-brand-hover);
}

.upd-enter-active,
.upd-leave-active {
  transition: all 0.2s ease;
}
.upd-enter-from,
.upd-leave-to {
  opacity: 0;
  transform: translateY(12px);
}
</style>
