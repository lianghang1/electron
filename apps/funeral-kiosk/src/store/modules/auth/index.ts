import type { AuthState, TenantInfo } from './types'

import { defineStore } from 'pinia'
import { getUserInfo } from '@/api/auth'
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
  const userId = computed(() => state.userInfo?.id)
  const isLoggedIn = computed(() => !!(userId.value && accessToken.value))
  const safeTenantId = computed(() => state.tenantId || '')
  const mobile = computed(() => state.userInfo?.mobile)

  const accessTokenWithType = computed(() => {
    const tokenValue = accessToken?.value
    if (!tokenValue) {
      return
    }
    const tokenType = state.accessInfo?.tokenType
    return tokenType ? `${tokenType} ${tokenValue}` : tokenValue
  })

  async function loadUserInfo() {
    const data = await getUserInfo({
      skipAuth: true,
    })
    state.userInfo = {
      id: data.id,
      nickname: data.nickName || '',
      avatar: data.avatar || '',
      mobile: data.mobile || '',
      tenants: data.tenants?.map((item) => {
        return {
          id: item.id,
          name: item.showName,
        } as TenantInfo
      }),
    }

    state.tenantId = data.tenant?.id || ''
    return state.userInfo
  }

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

    await loadUserInfo()
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
    userId,
    isLoggedIn,
    accessTokenWithType,
    safeTenantId,
    mobile,

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
