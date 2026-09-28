import { isEmpty } from '@fun-design/utils'
import { isValidIdCard as _isValidIdCard, areaMunicipality, getSexFromIdCard } from './idcard'

// isMobile as _isMobile,
// TODO: 手机号验证函数
function _isMobile(_value: string | number) {
  return false
}

/** 基础验证选项 */
interface BaseValidationOptions {
  /** 是否允许空值（默认 true） */
  allowEmpty?: boolean
  /** 是否允许 0 值（默认 false） */
  allowZero?: boolean
}

/** 手机号验证选项 */
interface IsMobileOptions extends BaseValidationOptions {
  /** 是否允许手机号包含 * （默认 true） */
  allowMask?: boolean
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
  // 解构并设置默认值
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

/**
 * 验证手机号
 * @param value 手机号
 * @param options 验证选项
 * @param options.allowEmpty 是否允许空值（默认 true）
 * @param options.allowZero 是否允许 0 值（默认 true）
 * @param options.allowMask 是否允许手机号包含 * （默认 true）
 * @returns 是否为手机号
 */
export function isValidMobile(value: string | number, options: IsMobileOptions = {}) {
  const { allowEmpty = true, allowZero = true, allowMask = true } = options

  if (isEmpty(value)) {
    return allowEmpty
  }

  const newValue = String(value)

  if (newValue === '0') {
    return allowZero
  }

  if (allowMask && newValue.includes('*')) {
    return true
  }

  return _isMobile(newValue)
}

export {
  areaMunicipality,
  getSexFromIdCard,
}
