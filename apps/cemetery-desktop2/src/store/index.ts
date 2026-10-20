import type { App } from 'vue'

import { Storage } from '@desktop/utils'
import { createPinia } from 'pinia'
import { createPersistedState } from 'pinia-plugin-persistedstate'

export function createStore(app: App) {
  const pinia = createPinia()

  pinia.use(createPersistedState({
    storage: {
      getItem: key => Storage.getSync(key),
      setItem: (key, value) => {
        Storage.setSync(key, value)
      },
    },
  }))

  app.use(pinia)

  return pinia
}
