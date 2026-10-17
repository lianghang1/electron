<script setup lang="ts">
import type { CaptureDeviceConfig } from '@desktop/shared'
import { ref, watch } from 'vue'
import { CONFIG_TRANSPORTS } from './use-capture-config'

/**
 * 单设备编辑表单：经具名模型就地编辑弹窗持有的配置草稿（弹窗关闭即丢弃未保存改动）。
 * KV 映射（dll 函数签名 / service 请求头）用「每行一条 键=值」文本编辑，首个 = 分隔键值。
 */
const config = defineModel<CaptureDeviceConfig>('config', { required: true })

const kvText = ref('')

/** transport 切换：补默认子对象、清无关子对象，避免陈旧参数随保存落库 */
function onTransportChange(e: Event): void {
  const value = (e.target as HTMLSelectElement).value as CaptureDeviceConfig['transport']
  config.value.transport = value
  config.value.ws = value === 'ws' ? config.value.ws ?? { url: '' } : undefined
  config.value.dll = value === 'dll' ? config.value.dll ?? { file: '' } : undefined
  config.value.service = value === 'service' ? config.value.service ?? { baseUrl: '', capturePath: '' } : undefined
}

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
  <div class="cu-cfgform">
    <div class="cu-cfgform__grid">
      <label class="cu-cfgform__field">
        <span class="cu-cfgform__label">设备名称</span>
        <input v-model="config.displayName" type="text" class="cu-cfgform__input">
      </label>
      <label class="cu-cfgform__field">
        <span class="cu-cfgform__label">品牌</span>
        <input v-model="config.brand" type="text" class="cu-cfgform__input" placeholder="如 点易拍">
      </label>
      <label class="cu-cfgform__field">
        <span class="cu-cfgform__label">接入方式</span>
        <select :value="config.transport" class="cu-cfgform__input" @change="onTransportChange">
          <option v-for="t in CONFIG_TRANSPORTS" :key="t.value" :value="t.value">
            {{ t.label }}
          </option>
        </select>
      </label>
    </div>

    <template v-if="config.transport === 'ws' && config.ws">
      <label class="cu-cfgform__field">
        <span class="cu-cfgform__label">WebSocket 地址</span>
        <input v-model="config.ws.url" type="text" class="cu-cfgform__input" placeholder="ws://localhost:9002">
      </label>
      <div class="cu-cfgform__grid cu-cfgform__grid--3">
        <label class="cu-cfgform__field">
          <span class="cu-cfgform__label">协议</span>
          <select v-model="config.ws.protocol" class="cu-cfgform__input">
            <option value="dianyipai">点易拍（二进制帧）</option>
            <option value="camsdk">华视 CamSDK（JSON）</option>
          </select>
        </label>
        <label class="cu-cfgform__field">
          <span class="cu-cfgform__label">摄像头编号</span>
          <input v-model.number="config.ws.camId" type="number" min="0" class="cu-cfgform__input">
        </label>
        <label class="cu-cfgform__field">
          <span class="cu-cfgform__label">宽度（px）</span>
          <input v-model.number="config.ws.width" type="number" min="0" class="cu-cfgform__input">
        </label>
      </div>
      <label class="cu-cfgform__field cu-cfgform__field--narrow">
        <span class="cu-cfgform__label">高度（px）</span>
        <input v-model.number="config.ws.height" type="number" min="0" class="cu-cfgform__input">
      </label>
    </template>

    <template v-else-if="config.transport === 'dll' && config.dll">
      <label class="cu-cfgform__field">
        <span class="cu-cfgform__label">DLL 路径</span>
        <input v-model="config.dll.file" type="text" class="cu-cfgform__input" placeholder="相对资源根（如 devices/zhaolin/ZLSDK.dll）或绝对路径">
      </label>
      <label class="cu-cfgform__field cu-cfgform__field--col">
        <span class="cu-cfgform__label">函数签名（每行一条：名称=签名）</span>
        <textarea v-model="kvText" rows="4" class="cu-cfgform__input cu-cfgform__area" placeholder="DevOpen=int __stdcall DevOpen(int nType, int nIndex)" @input="onKvInput" />
      </label>
    </template>

    <template v-else-if="config.transport === 'service' && config.service">
      <div class="cu-cfgform__grid">
        <label class="cu-cfgform__field">
          <span class="cu-cfgform__label">服务地址</span>
          <input v-model="config.service.baseUrl" type="text" class="cu-cfgform__input" placeholder="http://localhost:9002">
        </label>
        <label class="cu-cfgform__field">
          <span class="cu-cfgform__label">采集路径</span>
          <input v-model="config.service.capturePath" type="text" class="cu-cfgform__input" placeholder="/capture">
        </label>
      </div>
      <div class="cu-cfgform__grid cu-cfgform__grid--3">
        <label class="cu-cfgform__field">
          <span class="cu-cfgform__label">方法</span>
          <select v-model="config.service.method" class="cu-cfgform__input">
            <option value="GET">GET</option>
            <option value="POST">POST</option>
          </select>
        </label>
        <label class="cu-cfgform__field">
          <span class="cu-cfgform__label">列表路径（可选）</span>
          <input v-model="config.service.listPath" type="text" class="cu-cfgform__input">
        </label>
        <label class="cu-cfgform__field">
          <span class="cu-cfgform__label">图片字段</span>
          <input v-model="config.service.imageField" type="text" class="cu-cfgform__input" placeholder="留空 = 响应体即图片">
        </label>
      </div>
      <label class="cu-cfgform__field cu-cfgform__field--col">
        <span class="cu-cfgform__label">附加请求头（每行一条：名称=值）</span>
        <textarea v-model="kvText" rows="3" class="cu-cfgform__input cu-cfgform__area" @input="onKvInput" />
      </label>
    </template>

    <p v-else-if="config.transport === 'wia'" class="cu-cfgform__note">
      WIA 扫描仪无需附加参数，保存后由系统枚举设备
    </p>
  </div>
</template>

<style scoped>
.cu-cfgform {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.cu-cfgform__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.cu-cfgform__grid--3 {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.cu-cfgform__field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.cu-cfgform__field--narrow {
  max-width: calc(50% - 5px);
}

.cu-cfgform__field--col {
  grid-column: 1 / -1;
}

.cu-cfgform__label {
  font-size: 11px;
  color: #8a919c;
}

.cu-cfgform__input {
  width: 100%;
  border: 1px solid #d5dae1;
  border-radius: 8px;
  padding: 6px 10px;
  font-size: 12px;
  font-family: inherit;
  color: #1f2328;
  background: #fff;
  transition: border-color 0.12s;
}

.cu-cfgform__input:hover,
.cu-cfgform__input:focus {
  border-color: #0f766e;
  outline: none;
}

.cu-cfgform__area {
  resize: vertical;
  font-family: Consolas, Menlo, monospace;
  line-height: 1.5;
}

.cu-cfgform__note {
  margin: 0;
  font-size: 12px;
  color: #8a919c;
}
</style>
