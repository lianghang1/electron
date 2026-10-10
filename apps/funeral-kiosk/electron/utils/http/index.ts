import { createAlovaAxios } from '@fun-design/http-alova-axios'

const http = createAlovaAxios({}, {
  metaDefaults: {
    $toast: false,
    $loading: false,
    $token: false,
  },
  onRequest: () => {},
  extractData: (response, method) => {
    if (method.meta?.$raw) {
      return response.data
    }
    return response.data?.data
  },
})

export {
  http,
}
