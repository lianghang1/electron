import type { ClassValue } from 'clsx'
import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

/** 合并条件类与 Tailwind 冲突类；变体叠加时后者胜出 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}
