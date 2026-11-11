import type { ChannelId, ChannelPreference, PrintMode, PrintOptions } from '@shell/shared'

/** 便捷开关与显式通道的优先级：显式 channel > preview > dryRun > auto。 */
export function resolveChannelPreference(options: PrintOptions): ChannelPreference {
  return options.channel ?? (options.preview ? 'preview' : options.dryRun ? 'dry-run' : 'auto')
}

/** 通道 → 执行方式；穷尽分支保证新增 ChannelId 时编译器提醒同步。 */
export function channelMode(id: ChannelId): PrintMode {
  switch (id) {
    case 'system':
    case 'ipp':
      return 'spool'
    case 'preview':
      return 'preview'
    case 'dry-run':
      return 'dry-run'
    case 'simulated':
      return 'simulated'
  }
}
