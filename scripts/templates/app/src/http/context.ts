import type { BaseContext } from '@fun-design/http-alova-axios'
import { HttpContext as BaseHttpContext } from '@fun-design/http-alova-axios'

interface AppContext extends BaseContext {
  /**
   * 清除token
   */
  clearToken?: () => void

  /**
   * 获取token值，不包含token类型
   * @returns token值
   */
  getTokenValue?: () => string | null | undefined
}

class HttpContext extends BaseHttpContext {
  set(partial: Partial<AppContext>): void {
    super.set(partial)
  }

  private getAppContext() {
    return this.context as Partial<AppContext>
  }

  /**
   * 清除token
   */
  clearToken() {
    try {
      this.getAppContext().clearToken?.()
    }
    catch (err) {
      console.error('[http-context] clearToken error:', err)
    }
  }

  /**
   * 获取token值，不包含token类型
   * @returns token值
   */
  getTokenValue() {
    try {
      return this.getAppContext().getTokenValue?.()
    }
    catch (err) {
      console.error('[http-context] getTokenValue error:', err)
      return null
    }
  }
}

export const httpContext = new HttpContext()
