import { computed, defineComponent, onMounted, ref } from 'vue'
import { CATALOG, DEVICE_EVENT_NAMES } from '../js/catalog.js'
import { bridgeReal, call } from '../js/jsapi.js'
import { store } from '../js/store.js'

/** 总览：info 域快照 + 桥面全量清单 + 安全边界说明。 */
export default defineComponent({
  name: 'OverviewPanel',
  setup() {
    const loading = ref(false)
    const loadError = ref(null)

    onMounted(refresh)

    async function refresh() {
      loading.value = true
      loadError.value = null
      try {
        store.info = await call('info.get')
      }
      catch (err) {
        loadError.value = err
      }
      finally {
        loading.value = false
      }
    }

    const info = computed(() => store.info)
    const catalogRows = computed(() =>
      Object.entries(CATALOG).flatMap(([domain, spec]) =>
        Object.entries(spec.methods).map(([name, def]) => ({
          method: `${domain}.${name}`,
          label: spec.label,
          desc: def.desc,
        })),
      ),
    )
    const stateBadge = (state) => (state === 'ready' ? 'ok' : state === 'unavailable' ? 'err' : 'warn')

    return { store, info, catalogRows, loading, loadError, bridgeReal, DEVICE_EVENT_NAMES, stateBadge, refresh }
  },
})
