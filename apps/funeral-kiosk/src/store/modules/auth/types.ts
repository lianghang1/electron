export interface TenantInfo {
  id: string
  name: string
}

export interface UserInfo {
  id: string
  nickname: string
  avatar?: string
  mobile?: string
  tenants?: TenantInfo[]
  type?: string
}

export interface AccessInfo {
  token: string
  tokenType?: string
}

export interface AuthResult {
  token: string
  id?: string
}

export interface AuthState {
  userInfo?: UserInfo | null
  accessInfo?: AccessInfo | null
  tenantId?: string | null
  authReady: Promise<AuthResult> | null
}
