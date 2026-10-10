import { useIntervalFn, useNow } from '@vueuse/core'
import dayjs from 'dayjs'
import { computed } from 'vue'

export interface UseTimeOptions {
  timeFormat?: string
  dateFormat?: string
  interval?: number
  autoStart?: boolean
}

export function useTime(options: UseTimeOptions = {}) {
  const {
    timeFormat = 'HH:mm:ss',
    dateFormat = 'YYYY年MM月DD日 dddd',
    interval = 1000,
    autoStart = true,
  } = options

  const { now, pause, resume } = useNow({ controls: true, scheduler: cb => useIntervalFn(cb, interval) })

  if (!autoStart) {
    pause()
  }

  const time = computed(() => dayjs(now.value).format(timeFormat))
  const date = computed(() => dayjs(now.value).format(dateFormat))

  return {
    time,
    date,
    start: resume,
    stop: pause,
  }
}
