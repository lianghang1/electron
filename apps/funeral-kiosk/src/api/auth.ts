import { http } from '@/http'

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

export function getUserInfo(config: { skipAuth?: boolean } = { skipAuth: true }) {
  return http.Get<UserInfoResponse>(`/api-uaa/uaa/anon/userInfo`, {
    meta: {
      $skipAuth: config?.skipAuth,
    },
  })
}
