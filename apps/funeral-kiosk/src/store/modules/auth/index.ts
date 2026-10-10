import type { AuthState } from './types'

import { defineStore } from 'pinia'
import { kioskApi } from '@/api/kiosk'
import { httpContext } from '@/http'

export const useAuthStore = defineStore('auth-store', () => {
  // state
  const state = reactive<AuthState>({
    userInfo: null,
    accessInfo: null,
    authReady: null,
    tenantId: null,
  })

  // getters
  const accessToken = computed(() => state.accessInfo?.token)

  const accessTokenWithType = computed(() => {
    const tokenValue = accessToken?.value
    if (!tokenValue) {
      return
    }
    const tokenType = state.accessInfo?.tokenType
    return tokenType ? `${tokenType} ${tokenValue}` : tokenValue
  })

  function logout() {
    resetAuth({ redirectLogin: true })
  }

  function resetAuth(_options?: { redirectLogin?: boolean }) {
    state.userInfo = null
    state.accessInfo = null
  }

  async function refreshToken() {
    const data = await kioskApi.login()

    state.accessInfo = {
      token: data.token,
      tokenType: data.tokenType,
    }
  }

  httpContext.set({
    getToken: () => accessTokenWithType.value,
    getTokenValue: () => accessToken.value,
    clearToken: () => resetAuth({ redirectLogin: true }),
    refreshToken: () => refreshToken(),
  })

  return {
    // state
    ...toRefs(state),

    // getters
    accessToken,
    accessTokenWithType,

    // actions
    logout,
    resetAuth,
  }
}, {
  persist: {
    pick: [
      'accessInfo',
      'tenantId',
    ],
  },
})
