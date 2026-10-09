import type { AlovaMeta } from '@fun-design/http-alova-uniapp'

import 'alova'

declare module 'alova' {
  interface AlovaCustomTypes {
    meta: AlovaMeta & {
      /**
       * 是否返回原始响应（跳过 extractData 提取）
       *
       * 默认 `false`，设为 `true` 返回完整 `HttpResponse`
       */
      $raw?: boolean

      /**
       * 是否跳过未授权（401）处理
       *
       * 默认 `false`，401 时执行 token 清除；
       * 设为 `true` 跳过未授权处理
       */
      $skipAuth?: boolean
    }
  }
}
