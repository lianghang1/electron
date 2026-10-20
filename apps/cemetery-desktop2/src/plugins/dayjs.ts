import { setDayjsLocale, setupDayjs } from '@fun-design/utils'
import dayjs from 'dayjs'
import localeData from 'dayjs/plugin/localeData'
import 'dayjs/locale/zh-cn'

export function createDayJsPlugin() {
  setupDayjs(localeData)
  setDayjsLocale('zh-cn')
  // @fun-design/utils 内部打包了独立的 dayjs 副本，上面的设置只作用于它的副本。
  // 应用层（如 useTime.ts）使用的是另一个 dayjs 实例，需单独设置中文本地化。
  // 注意：不要在此对应用 dayjs 重复 extend(localeData)，会与应用/库两份 dayjs 类型冲突；
  // 星期等本地化文案由 locale 数据提供，核心 format 即可输出中文。
  dayjs.locale('zh-cn')
}
