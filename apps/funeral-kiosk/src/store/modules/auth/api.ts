import { http } from '@/http'

// export interface LoginWxMiniProgramRequest {
//   code: string
//   phoneCode?: string
//   encryptedData?: string
//   iv?: string
// }

// export interface LoginAccountRequest {
//   phone: string
//   pwd: string
// }

// export interface LoginResponse {
//   token: string
//   userId: string
//   nickName: string
//   phone?: string
//   headImgUrl?: string
// }

// export interface RegisterTenantRequest {
//   name: string
//   phone: string
//   verifyCode: string
// }

// export interface SendRegisterTenantCodeRequest {
//   phone: string
// }

// export interface SendRegisterTenantCodeResponse {
//   verifyCode?: string
// }

// type LoginGrantType
//   = | 'password_api_code'
//     | 'tenant_switch'
//     | 'password_api_mobile'
//     | 'password_api_username'

interface LoginRequestBase {
  grant_type: string
  deviceId?: string
  tenantId?: string
}

export interface LoginResponse {
  access_token: string
  token_type: string
}

export interface Tenant {
  id: string
  name: string
  showName: string
}

export interface UserInfoResponse {
  id: string
  username: string
  nickName?: string
  mobile?: string
  avatar?: string
  tenant?: Tenant
  tenants?: Tenant[]
}

export interface LoginWxRequest extends LoginRequestBase {
  openCode: string
  socialType: 'wxApp' | 'wxMp'
  grant_type: 'password_api_code'
  appId: string
  phoneCode?: string
  encryptedData?: Record<string, any>
  iv?: string
}

export interface LoginSmsRequest extends LoginRequestBase {
  mobile: string
  mobileCode: string
  iv: string
  grant_type: 'password_api_mobile'
}

export function login(params: LoginWxRequest | LoginSmsRequest, authorization: string) {
  return http.PostForm<LoginResponse>(`/api-uaa/oauth/token`, params, {
    headers: {
      Authorization: `Basic ${authorization}`,
    },
    meta: {
      $token: false,
      $toast: false,
    },
  })
}

export function getUserInfo() {
  return http.Get<UserInfoResponse>(`/api-uaa/uaa/anon/userInfo`, {
    meta: {
      $skipAuth: true,
    },
  })
}
