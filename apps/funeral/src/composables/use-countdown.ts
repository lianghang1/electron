import type { InjectionKey } from 'vue'

/**
 * 无操作倒计时：App.vue 提供，页面可注入以缩短当前轮倒计时
 * （如支付页等待扫码时延长容忍度）。
 */
export const fhResetCountdownKey: InjectionKey<(expireSecond?: number) => void> = Symbol('fhResetCountdown')
