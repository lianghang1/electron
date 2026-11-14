import { computed, defineComponent, ref } from 'vue'

const DESC_KEYS = new Set(['description', 'id', 'deviceId', 'displayName', 'name', 'status', 'state', 'isDefault'])
const STATE_OK = new Set(['ready', 'ok', 'online', 'connected'])

/**
 * 设备卡片列表（吸收 HDC 参考布局）：名称 + 描述行 + 状态徽标，Details 展开剩余字段键值。
 * 设备形状宽容渲染：print 域用 name/status，其余域用 displayName/status。
 */
export default defineComponent({
  name: 'DeviceList',
  props: {
    devices: { type: Array, default: () => [] },
  },
  setup(props) {
    const expandedId = ref(null)
    const titleOf = d => d.displayName ?? d.name ?? d.deviceId ?? d.id ?? '未命名设备'
    const descOf = d => (d.description ?? [d.capabilityId, d.channelId].filter(Boolean).join(' · ')) || d.deviceId || d.id || ''
    const stateOf = d => d.state ?? d.status ?? 'unknown'
    const stateClass = (s) => {
      if (STATE_OK.has(String(s).toLowerCase())) { return 'ok' }
      if (/err|fail|offline|disconnect/i.test(String(s))) { return 'err' }
      return 'warn'
    }
    const detailsOf = computed(() => props.devices.map(d => Object.entries(d).filter(([k]) => !DESC_KEYS.has(k))))
    function toggle(i) { expandedId.value = expandedId.value === i ? null : i }
    return { expandedId, titleOf, descOf, stateOf, stateClass, detailsOf, toggle }
  },
  template: `
    <div class="dc-device-list">
      <div v-for="(d, i) in devices" :key="i" class="dc-device-card">
        <div class="dc-device-row" @click="toggle(i)">
          <div class="dc-device-info">
            <span class="dc-device-name">{{ titleOf(d) }}</span>
            <span class="dc-device-desc">{{ descOf(d) }}</span>
          </div>
          <div class="dc-device-tags">
            <span v-if="d.isDefault" class="dc-badge accent">默认</span>
            <span class="dc-badge" :class="stateClass(stateOf(d))">{{ stateOf(d) }}</span>
            <span class="dc-device-more">{{ expandedId === i ? '收起' : '详情' }}</span>
          </div>
        </div>
        <dl v-if="expandedId === i" class="dc-kv dc-device-detail">
          <template v-for="([k, v]) in detailsOf[i]" :key="k">
            <dt>{{ k }}</dt>
            <dd>{{ typeof v === 'object' ? JSON.stringify(v) : String(v) }}</dd>
          </template>
        </dl>
      </div>
      <div v-if="!devices.length" class="dc-empty">无设备</div>
    </div>
  `,
})
