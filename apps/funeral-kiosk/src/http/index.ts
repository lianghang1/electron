import { createAlovaAxios } from '@fun-design/http-alova-axios'

import { httpContext } from './context'

export const baseURL = __VITE_API_BASE_URL__

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
      throw new Error('token expired')
    },
  },
  extractData: (response, method) => {
    if (method.meta?.$raw) {
      return response.data
    }
    return response.data?.response
  },
})

export type RequestConfig<R = any, T = any> = Parameters<typeof http.Post<R, T>>[2]

export {
  http,
  httpContext,
}
