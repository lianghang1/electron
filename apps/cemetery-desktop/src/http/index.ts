import { createAlovaAxios } from '@fun-design/http-alova-axios'

import { httpContext } from './context'

export const baseURL = import.meta.env.VITE_API_BASE_URL

const http = createAlovaAxios({
  baseURL,
  cacheLogger: import.meta.env.DEV,
}, {
  context: httpContext,
  metaDefaults: {
    $toast: true,
    $loading: true,
    $token: true,
  },
  onRequest: () => {
  },
  tokenRefresher: {
    isExpired: (response) => {
      return response.status === 401 || response.status === 20001
    },
    handler: async (_response, method) => {
      if (method.meta?.$skipAuth !== true) {
        httpContext.clearToken()
      }
      if (method.meta?.$refreshToken) {
        throw new Error('token expired')
      }
      await httpContext.refreshToken()
    },
  },
  extractData: (response, method) => {
    if (method.meta?.$raw) {
      return response.data
    }
    return response.data?.data
  },
})

export type RequestConfig<R = any, T = any> = Parameters<typeof http.Post<R, T>>[2]

export {
  http,
  httpContext,
}
