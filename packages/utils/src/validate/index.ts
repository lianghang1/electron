import { isEmpty } from '@fun-design/utils'
import { isValidIdCard as _isValidIdCard, areaMunicipality, getSexFromIdCard } from './idcard'

/** 基础验证选项 */
interface BaseValidationOptions {
  /** 是否允许空值（默认 true） */
  allowEmpty?: boolean
  /** 是否允许 0 值（默认 false） */
  allowZero?: boolean
}

/**
 * 验证身份证号
 * @param value 身份证号
 * @param options 验证选项
 * @param options.allowEmpty 是否允许空值（默认 true）
 * @param options.allowZero 是否允许 0 值（默认 false）
 * @returns 是否为身份证号
 */
export function isValidIdCard(value: string | number, options: BaseValidationOptions = {}) {
  const { allowEmpty = true, allowZero = false } = options

  if (isEmpty(value)) {
    return allowEmpty
  }

  const newValue = String(value)

  if (newValue === '0') {
    return allowZero
  }

  return _isValidIdCard(newValue)
}

export {
  areaMunicipality,
  getSexFromIdCard,
}
