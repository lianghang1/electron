<script setup lang="ts">
import type { CaptureDeviceConfig } from '@desktop/shared'
import { computed } from 'vue'

/**
 * 单设备编辑表单：经具名模型就地编辑弹窗持有的配置草稿（改动防抖自动保存，非法草稿不落库）。
 * 统一行式布局：标签左 96px、控件右。
 * 档案清单与技术字段（品牌/接入方式/协议/能力/DLL）由代码出厂预设锁死：
 * 品牌与接入方式在编辑头徽标展示，现场仅可编辑名称与连接参数。
 */
const config = defineModel<CaptureDeviceConfig>('config', { required: true })

/** 拉起命令可选字段（wake 对象缺省时读写安全）：非空建对象、空清字段，避免空壳落库 */
const wakeCommand = computed({
  get: () => config.value.ws?.wake?.command ?? '',
  set: (value: string) => {
    if (!config.value.ws) {
      return
    }
    const command = value.trim()
    config.value.ws.wake = command ? { command } : undefined
  },
})
</script>

<template>
  <div class="cap-form">
    <section class="cap-form__section">
      <h4 class="cap-form__title">
        基本信息
      </h4>
      <label class="cap-row">
        <span class="cap-row__label">设备名称</span>
        <input v-model="config.displayName" type="text" class="cap-row__input">
      </label>
      <div class="cap-row">
        <span class="cap-row__label">品牌（出厂预设）</span>
        <span class="cap-row__static">{{ config.brand || '—' }}</span>
      </div>
    </section>

    <section v-if="config.transport === 'ws' && config.ws" class="cap-form__section">
      <h4 class="cap-form__title">
        连接参数
      </h4>
      <label class="cap-row">
        <span class="cap-row__label">WebSocket 地址</span>
        <input v-model="config.ws.url" type="text" class="cap-row__input" placeholder="ws://localhost:9002">
      </label>
      <label class="cap-row">
        <span class="cap-row__label">摄像头编号</span>
        <input v-model.number="config.ws.camId" type="number" min="0" class="cap-row__input cap-row__input--short">
      </label>
      <label class="cap-row">
        <span class="cap-row__label">分辨率（px）</span>
        <div class="cap-row__control cap-row__control--pair">
          <input v-model.number="config.ws.width" type="number" min="0" class="cap-row__input" placeholder="宽">
          <span class="cap-row__times">×</span>
          <input v-model.number="config.ws.height" type="number" min="0" class="cap-row__input" placeholder="高">
        </div>
      </label>
      <label class="cap-row">
        <span class="cap-row__label">拉起命令</span>
        <input v-model="wakeCommand" type="text" class="cap-row__input" placeholder="留空 = 按「品牌」自动发现计划任务/服务">
      </label>
      <p class="cap-form__note">
        服务探活失败时执行；留空则按「品牌」自动发现并拉起厂商计划任务/服务
      </p>
    </section>

    <section v-else-if="config.transport === 'service' && config.service" class="cap-form__section">
      <h4 class="cap-form__title">
        连接参数
      </h4>
      <label class="cap-row">
        <span class="cap-row__label">服务地址</span>
        <input v-model="config.service.baseUrl" type="text" class="cap-row__input" placeholder="http://localhost:9002">
      </label>
      <label class="cap-row">
        <span class="cap-row__label">采集路径</span>
        <input v-model="config.service.capturePath" type="text" class="cap-row__input" placeholder="/capture">
      </label>
      <label class="cap-row">
        <span class="cap-row__label">列表路径</span>
        <input v-model="config.service.listPath" type="text" class="cap-row__input" placeholder="可选">
      </label>
    </section>

    <p v-else-if="config.transport === 'wia'" class="cap-form__note">
      WIA 扫描仪无需附加参数，保存后由系统枚举设备
    </p>
    <p v-else-if="config.transport === 'dll'" class="cap-form__note">
      DLL 由设备守护进程按驱动注册表自动加载，无现场可调参数
    </p>
  </div>
</template>

<style scoped>
.cap-form {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.cap-form__section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.cap-form__title {
  margin: 0 0 2px;
  font-size: 13px;
  font-weight: 600;
  line-height: 18px;
  color: #1f2328;
}

.cap-row {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 30px;
}

.cap-row__label {
  width: 96px;
  flex-shrink: 0;
  font-size: 12.5px;
  line-height: 16px;
  color: #5f6673;
}

.cap-row__control {
  flex: 1;
  min-width: 0;
  max-width: 400px;
}

.cap-row__control--pair {
  display: flex;
  align-items: center;
  gap: 8px;
  max-width: 260px;
}

.cap-row__times {
  color: #a2aab6;
  font-size: 12px;
  flex-shrink: 0;
}

.cap-row__static {
  flex: 1;
  max-width: 400px;
  display: flex;
  align-items: center;
  height: 30px;
  padding: 0 10px;
  border: 1px dashed #e3e8ee;
  border-radius: 8px;
  font-size: 12px;
  color: #57606a;
  background: #f6f8fa;
}

.cap-row__input {
  flex: 1;
  min-width: 0;
  max-width: 400px;
  height: 30px;
  border: 1px solid #d5dae1;
  border-radius: 8px;
  padding: 0 10px;
  font-size: 12px;
  font-family: inherit;
  color: #1f2328;
  background: #fff;
  transition: border-color 0.12s;
}

.cap-row__input--short {
  max-width: 140px;
  flex: 0 0 140px;
}

.cap-row__control--pair .cap-row__input {
  max-width: none;
}

.cap-row__input:hover,
.cap-row__input:focus {
  border-color: #0f766e;
  outline: none;
}

.cap-form__note {
  margin: 0;
  font-size: 12px;
  color: #8a919c;
}
</style>
