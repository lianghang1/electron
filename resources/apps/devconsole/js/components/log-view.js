import { computed, defineComponent, ref } from 'vue'
import { store } from '../store.js'

/** 统一日志视图：调用流水列表 + 点击行展开输入/结果 JSON。 */
export default defineComponent({
  name: 'LogView',
  setup() {
    const expandedId = ref(null)
    const selected = computed(() => store.logs.find(l => l.id === expandedId.value))
    function fmtTime(ts) {
      const d = new Date(ts)
      const p = n => String(n).padStart(2, '0')
      return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${String(d.getMilliseconds()).padStart(3, '0')}`
    }
    function fmtValue(value) {
      return JSON.stringify(value, null, 2) ?? 'undefined'
    }
    function toggle(id) { expandedId.value = expandedId.value === id ? null : id }
    return { store, expandedId, selected, fmtTime, fmtValue, toggle }
  },
  template: `
    <div class="dc-logs">
      <div v-if="!store.logs.length" class="dc-empty">暂无调用记录</div>
      <template v-for="log in store.logs" :key="log.id">
        <div class="dc-log-row" @click="toggle(log.id)">
          <span class="dc-log-ts">{{ fmtTime(log.ts) }}</span>
          <span class="dc-log-method">{{ log.method }}</span>
          <span class="dc-log-state" :class="log.ok ? 'ok' : 'err'">{{ log.ok ? (log.mocked ? 'mock' : 'ok') : log.error.code }}</span>
          <span class="dc-log-ms">{{ log.ms }}ms</span>
        </div>
        <div v-if="expandedId === log.id" class="dc-log-detail">入参：{{ fmtValue(log.input) }}<br>{{ log.ok ? '结果：' + fmtValue(log.result) : '错误：' + fmtValue(log.error) }}</div>
      </template>
      <div v-if="selected" style="height:0"></div>
    </div>
  `,
})
