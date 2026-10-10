import { http } from '@electron/utils/http'
import { funeralKioskDomain, handle } from './handle'

export function registerLoginHandle(): void {
  handle(funeralKioskDomain.channels.login, async () => {
    const account = import.meta.env.MAIN_VITE_PLATFORM_ACCOUNT
    const password = import.meta.env.MAIN_VITE_PLATFORM_PASSWORD

    if (!account || !password) {
      throw new Error('MAIN_VITE_PLATFORM_ACCOUNT or MAIN_VITE_PLATFORM_PASSWORD is not set')
    }

    const data = await http.PostForm<{
      access_token: string
      token_type: string
    }>(`${import.meta.env.MAIN_VITE_PLATFORM_API_BASE_URL}/api-uaa/oauth/token`, {
      username: account,
      password,
      grant_type: 'password_sdk_pwd',
      deviceId: 'deviceId',
    }, {
      headers: {
        Authorization: 'Basic YXBwLWNsaWVudC1zZGs6YXBwLWNsaWVudA==',
      },
    })
    return {
      token: data.access_token,
      tokenType: data.token_type,
    }
  })
}
