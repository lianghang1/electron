import type { RegisteredApp } from '@desktop/shared'
import { onMounted, ref } from 'vue'

/** App Launcher / 应用中心数据源：直接读平台 AppRegistry，UI 不自维护应用清单 */
export function useApps() {
  const apps = ref<RegisteredApp[]>([])
  /** 宿主应用名称（bootstrap app.name，Main 侧合成 Shell 身份返回） */
  const hostName = ref('')

  onMounted(async () => {
    apps.value = await window.desktop.app.list()
    const current = await window.desktop.app.getCurrent()
    hostName.value = current.manifest.name
  })

  return { apps, hostName }
}
