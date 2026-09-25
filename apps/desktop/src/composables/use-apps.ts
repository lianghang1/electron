import type { DesktopAppManifest } from '@desktop/shared'
import { onMounted, ref } from 'vue'

/** App Launcher 数据源：直接读平台 AppRegistry，UI 不自维护应用清单 */
export function useApps() {
  const apps = ref<DesktopAppManifest[]>([])

  onMounted(async () => {
    apps.value = await window.desktop.app.list()
  })

  return { apps }
}
