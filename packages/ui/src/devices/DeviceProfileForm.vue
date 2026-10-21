<script setup lang="ts">
/**
 * 设备档案编辑表单：身份证读卡 / 签名屏 / IC 卡三域共用（档案结构同构，ws/dll 双路线）。
 * 经具名模型就地编辑面板持有的档案草稿，参照 CaptureDeviceForm 模式。
 * 接入方式随档案本身（不在表单内切换，编辑头徽标展示）：ws 段编辑服务地址；
 * dll 段参数预留——DLL 由设备守护进程按驱动注册表自动加载，此处不消费。
 */
const props = defineProps<{
  /** 设备名称占位提示 */
  namePlaceholder?: string
  /** 厂商占位提示 */
  brandPlaceholder?: string
  /** 服务地址占位提示 */
  urlPlaceholder?: string
  /** 服务地址下方说明 */
  urlHint?: string
}>()

const config = defineModel<{
  displayName: string
  brand: string
  transport: 'ws' | 'dll'
  ws?: { url: string }
  dll?: { file?: string }
}>('config', { required: true })
</script>

<template>
  <div class="dpf-form">
    <label class="dpf-field">
      <span class="dpf-field__label">设备名称</span>
      <input v-model="config.displayName" type="text" class="dpf-input" :placeholder="props.namePlaceholder">
    </label>
    <label class="dpf-field">
      <span class="dpf-field__label">厂商</span>
      <input v-model="config.brand" type="text" class="dpf-input" :placeholder="props.brandPlaceholder">
    </label>

    <label v-if="config.transport === 'ws' && config.ws" class="dpf-field dpf-field--wide">
      <span class="dpf-field__label">服务地址（ws）</span>
      <input v-model="config.ws.url" type="text" class="dpf-input dpf-input--mono" :placeholder="props.urlPlaceholder">
      <span v-if="props.urlHint" class="dpf-field__hint">{{ props.urlHint }}</span>
    </label>

    <template v-else-if="config.transport === 'dll'">
      <label v-if="config.dll" class="dpf-field dpf-field--wide">
        <span class="dpf-field__label">DLL 路径（预留）</span>
        <input v-model="config.dll.file" type="text" class="dpf-input dpf-input--mono" placeholder="暂无需填写">
      </label>
      <div class="dpf-field dpf-field--wide">
        <span class="dpf-field__hint">DLL 由设备守护进程按驱动注册表自动加载，无需配置；路径参数为后续扩展预留。</span>
      </div>
    </template>
  </div>
</template>

<style scoped>
.dpf-form {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.dpf-field {
  display: flex;
  flex-direction: column;
  gap: 5px;
  min-width: 0;
}

.dpf-field--wide {
  grid-column: 1 / -1;
}

.dpf-field__label {
  font-size: 11.5px;
  color: #57606a;
}

.dpf-field__hint {
  font-size: 11px;
  color: #a5adb8;
  line-height: 1.5;
}

.dpf-input {
  height: 30px;
  border: 1px solid #d5dae1;
  border-radius: 8px;
  padding: 0 10px;
  font-size: 12px;
  font-family: inherit;
  color: #1f2328;
  background: #fff;
  min-width: 0;
  transition: border-color 0.12s;
}

.dpf-input--mono {
  font-family: Consolas, 'Cascadia Code', monospace;
}

.dpf-input:hover,
.dpf-input:focus {
  border-color: #0f766e;
  outline: none;
}
</style>
