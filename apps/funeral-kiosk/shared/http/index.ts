import { createAlovaAxios } from '@fun-design/http-alova-axios'

const http = createAlovaAxios({}, {
  metaDefaults: {
    $toast: false,
    $loading: false,
    $token: false,
  },
  onRequest: () => {},
})

export {
  http,
}
