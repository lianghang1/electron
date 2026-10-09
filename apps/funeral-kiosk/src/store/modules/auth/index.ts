import type { LoginResponse, LoginSmsRequest } from './api'
import type { AuthState, TenantInfo } from './types'
import { defineStore } from 'pinia'
import { httpContext } from '@/http'
import { getRedirectLoginPath } from '@/models/app/constants'
import { getCurrentPageStack } from '@/utils'
import { useAppStore } from '../app'
import { login } from './api'

/**
 * 全局跳转登录页标志
 */
let GLOBAL_REDIRECT_LOGIN = false

export const useAuthStore = defineStore('auth-store', () => {
  // state
  const state = reactive<AuthState>({
    userInfo: null,
    accessInfo: null,
    authReady: null,
    tenantId: null,
  })

  const appStore = useAppStore()

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

  async function setLoginData(data: LoginResponse) {
    state.accessInfo = {
      token: data.access_token,
      tokenType: data.token_type,
    }
    await loadUserInfo()
  }

  async function loginSms(params: { mobile: string, code: string, iv: string }) {
    const request: LoginSmsRequest = {
      grant_type: 'password_api_mobile',
      mobile: params.mobile,
      mobileCode: params.code,
      iv: params.iv,
      tenantId: safeTenantId.value,
      deviceId: appStore.deviceId,
    }
    const data = await login(request, 'YXBwLWNsaWVudC1hcGlNYjphcHAtY2xpZW50')
    await setLoginData(data)
  }

  async function loadUserInfo() {
    const data = await getUserInfo()
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

  /**
   * 跳转登录页
   * @param fullPath redirect 完整路径
   * @returns 是否执行跳转
   */
  function redirectLogin(fullPath?: string): boolean {
    if (GLOBAL_REDIRECT_LOGIN) {
      console.debug(`global redirect login: ${fullPath}`)
      return false
    }

    GLOBAL_REDIRECT_LOGIN = true

    const redirectPath = getRedirectLoginPath(fullPath)

    uni.redirectTo({
      url: redirectPath,
      complete: () => {
        setTimeout(() => {
          GLOBAL_REDIRECT_LOGIN = false
        }, 750)
      },
    })
    return true
  }

  function resetAuth(options?: { redirectLogin?: boolean }) {
    state.userInfo = null
    state.accessInfo = null

    if (options?.redirectLogin) {
      const pageStack = getCurrentPageStack()
      redirectLogin(pageStack?.$page?.fullPath)
    }
  }

  async function autoLogin() {
    return null
  }

  httpContext.set({
    getToken: () => accessTokenWithType.value,
    getTokenValue: () => accessToken.value,
    clearToken: () => resetAuth({ redirectLogin: true }),
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
    setLoginData,
    loginSms,
    loadUserInfo,
    logout,
    resetAuth,
    redirectLogin,
  }
}, {
  persist: {
    paths: [
      'accessInfo',
      'tenantId',
    ],
  },
})
