<script setup lang="ts">
import { usePermissionRequests } from '../composables/use-permission-requests'

const { requests, label, respond } = usePermissionRequests()
</script>

<template>
  <!-- 底部通知横幅：作为 .dt-main 弹性布局的底部成员，
       出现时 viewport 自动收缩（ResizeObserver 随之同步 Web 容器区域），
       顶部内容不动，只有底部让位，感知干扰最小（Chrome 下载栏同款交互） -->
  <TransitionGroup v-if="requests.length > 0" tag="div" name="prq" class="prq-banner">
    <div v-for="request in requests" :key="request.requestId" class="prq-row">
      <span class="prq-dot" />
      <div class="prq-info">
        <span class="prq-title">权限请求</span>
        <span class="prq-desc">
          <strong>{{ request.appName }}</strong> 申请获得{{ label(request.permission) }}权限，是否允许？
        </span>
      </div>
      <div class="prq-actions">
        <button class="prq-btn prq-btn--ghost" @click="respond(request.requestId, false)">
          拒绝
        </button>
        <button class="prq-btn prq-btn--primary" @click="respond(request.requestId, true)">
          允许
        </button>
      </div>
    </div>
  </TransitionGroup>
</template>

<style scoped>
.prq-banner {
  flex: none;
  background: var(--dt-surface);
  border-top: 1px solid var(--dt-line);
  transition: background var(--dt-dur) var(--dt-ease), border-color var(--dt-dur) var(--dt-ease);
}
.prq-row {
  display: flex;
  align-items: center;
  height: 52px;
  padding: 0 16px;
}
.prq-row + .prq-row {
  border-top: 1px solid var(--dt-line-soft);
}
.prq-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--dt-brand);
  margin-right: 12px;
  flex: none;
}
.prq-info {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: baseline;
  overflow: hidden;
}
.prq-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--dt-text);
  margin-right: 12px;
  flex: none;
}
.prq-desc {
  font-size: 13px;
  color: var(--dt-text-2);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.prq-desc strong {
  color: var(--dt-text);
  font-weight: 600;
}
.prq-actions {
  flex: none;
  display: flex;
  gap: 8px;
  margin-left: 16px;
}
.prq-btn {
  height: 28px;
  padding: 0 16px;
  border-radius: var(--dt-radius-1);
  border: 1px solid transparent;
  font-size: 12px;
  font-weight: 500;
  font-family: inherit;
  cursor: pointer;
  transition: background var(--dt-dur) var(--dt-ease), border-color var(--dt-dur) var(--dt-ease);
}
.prq-btn--primary {
  background: var(--dt-brand);
  color: var(--dt-brand-on);
}
.prq-btn--primary:hover {
  background: var(--dt-brand-hover);
}
.prq-btn--ghost {
  background: var(--dt-surface);
  border-color: var(--dt-line);
  color: var(--dt-text-2);
}
.prq-btn--ghost:hover {
  background: var(--dt-hover);
}

.prq-enter-active,
.prq-leave-active {
  transition: all 0.2s ease;
}
.prq-enter-from,
.prq-leave-to {
  opacity: 0;
  transform: translateY(12px);
}
</style>
