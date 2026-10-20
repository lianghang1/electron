<script setup lang="ts">
import type { CaptureDeviceConfig } from '@desktop/shared'
import { computed, ref, watch } from 'vue'
import UiSelect from '../select/UiSelect.vue'
import { CONFIG_TRANSPORTS } from './use-capture-config'

/**
 * 单设备编辑表单：经具名模型就地编辑弹窗持有的配置草稿（弹窗关闭即丢弃未保存改动）。
 * 统一行式布局：标签左 96px、控件右，废除参差的多列栅格。
 * KV 映射（dll 函数签名 / service 请求头）用「每行一条 键=值」文本编辑，首个 = 分隔键值。
 */
const config = defineModel<CaptureDeviceConfig>('config', { required: true })

/** 下拉选项（reka 不允许空值，协议未设置用 'default' 哨兵表达「默认」语义） */
const transportOptions = CONFIG_TRANSPORTS.map(t => ({ value: t.value, label: t.label }))
const protocolOptions = [
  { value: 'default', label: '默认' },
  { value: 'dianyipai', label: '点易拍（二进制帧）' },
  { value: 'camsdk', label: '华视 CamSDK（JSON）' },
]
const methodOptions = [
  { value: 'GET', label: 'GET' },
  { value: 'POST', label: 'POST' },
]

/** 协议/方法为可选字段：经哨兵值与 computed 中转，避免 undefined 直连 UiSelect */
const protocolValue = computed(() => config.value.ws?.protocol ?? 'default')
const methodValue = computed(() => config.value.service?.method ?? 'GET')

/** transport 切换：补默认子对象、清无关子对象，避免陈旧参数随保存落库 */
function onTransportChange(value: string): void {
  const transport = value as CaptureDeviceConfig['transport']
  config.value.transport = transport
  config.value.ws = transport === 'ws' ? config.value.ws ?? { url: '' } : undefined
  config.value.dll = transport === 'dll' ? config.value.dll ?? { file: '' } : undefined
  config.value.service = transport === 'service' ? config.value.service ?? { baseUrl: '', capturePath: '' } : undefined
}

/** 协议切换：'default' 哨兵还原为未设置（交由驱动默认处理） */
function onProtocolChange(value: string): void {
  if (!config.value.ws) { return }
  config.value.ws.protocol = value === 'default' ? undefined : value as 'dianyipai' | 'camsdk'
}

function onMethodChange(value: string): void {
  if (!config.value.service) { return }
  config.value.service.method = value as 'GET' | 'POST'
}

const kvText = ref('')

watch(() => [config.value.id, config.value.transport], syncKvText, { immediate: true })

function syncKvText(): void {
  const source = config.value.transport === 'dll'
    ? config.value.dll?.functions
    : config.value.service?.extraHeaders
  kvText.value = Object.entries(source ?? {}).map(([k, v]) => `${k}=${v}`).join('\n')
}

function onKvInput(): void {
  const record: Record<string, string> = {}
  for (const line of kvText.value.split('\n')) {
    const text = line.trim()
    if (!text) { continue }
    const eq = text.indexOf('=')
    if (eq <= 0) { continue }
    record[text.slice(0, eq).trim()] = text.slice(eq + 1).trim()
  }
  const hasKeys = Object.keys(record).length > 0
  if (config.value.transport === 'dll' && config.value.dll) {
    config.value.dll.functions = hasKeys ? record : undefined
  }
  else if (config.value.transport === 'service' && config.value.service) {
    config.value.service.extraHeaders = hasKeys ? record : undefined
  }
}
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
      <label class="cap-row">
        <span class="cap-row__label">品牌</span>
        <input v-model="config.brand" type="text" class="cap-row__input" placeholder="如 点易拍">
      </label>
      <div class="cap-row">
        <span class="cap-row__label">接入方式</span>
        <div class="cap-row__control">
          <UiSelect
            :model-value="config.transport"
            :options="transportOptions"
            @update:model-value="onTransportChange"
          />
        </div>
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
      <div class="cap-row">
        <span class="cap-row__label">协议</span>
        <div class="cap-row__control">
          <UiSelect :model-value="protocolValue" :options="protocolOptions" @update:model-value="onProtocolChange" />
        </div>
      </div>
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
    </section>

    <section v-else-if="config.transport === 'dll' && config.dll" class="cap-form__section">
      <h4 class="cap-form__title">
        连接参数
      </h4>
      <label class="cap-row">
        <span class="cap-row__label">DLL 路径</span>
        <input v-model="config.dll.file" type="text" class="cap-row__input" placeholder="相对资源根（如 devices/huashi/win64/Termb.dll）或绝对路径">
      </label>
      <label class="cap-row cap-row--top">
        <span class="cap-row__label">函数签名</span>
        <textarea
          v-model="kvText"
          rows="4"
          class="cap-row__area"
          placeholder="每行一条：名称=签名（如 DevOpen=int __stdcall DevOpen(int nType, int nIndex)）"
          @input="onKvInput"
        />
      </label>
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
      <div class="cap-row">
        <span class="cap-row__label">方法</span>
        <div class="cap-row__control">
          <UiSelect :model-value="methodValue" :options="methodOptions" @update:model-value="onMethodChange" />
        </div>
      </div>
      <label class="cap-row">
        <span class="cap-row__label">列表路径</span>
        <input v-model="config.service.listPath" type="text" class="cap-row__input" placeholder="可选">
      </label>
      <label class="cap-row">
        <span class="cap-row__label">图片字段</span>
        <input v-model="config.service.imageField" type="text" class="cap-row__input" placeholder="留空 = 响应体即图片">
      </label>
      <label class="cap-row cap-row--top">
        <span class="cap-row__label">附加请求头</span>
        <textarea
          v-model="kvText"
          rows="3"
          class="cap-row__area"
          placeholder="每行一条：名称=值"
          @input="onKvInput"
        />
      </label>
    </section>

    <p v-else-if="config.transport === 'wia'" class="cap-form__note">
      WIA 扫描仪无需附加参数，保存后由系统枚举设备
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

.cap-row--top {
  align-items: flex-start;
}

.cap-row--top .cap-row__label {
  padding-top: 7px;
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

.cap-row__area {
  flex: 1;
  min-width: 0;
  border: 1px solid #d5dae1;
  border-radius: 8px;
  padding: 7px 10px;
  font-size: 12px;
  font-family: Consolas, Menlo, monospace;
  line-height: 1.5;
  color: #1f2328;
  background: #fff;
  resize: vertical;
  transition: border-color 0.12s;
}

.cap-row__area:hover,
.cap-row__area:focus {
  border-color: #0f766e;
  outline: none;
}

.cap-form__note {
  margin: 0;
  font-size: 12px;
  color: #8a919c;
}
</style>
