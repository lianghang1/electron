/**
 * @description 中国身份证号校验与解析工具集
 */

/** 省份代码映射 */
const PROVINCE_MAP: Record<string, string> = {
  11: '北京',
  12: '天津',
  13: '河北',
  14: '山西',
  15: '内蒙古',
  21: '辽宁',
  22: '吉林',
  23: '黑龙江',
  31: '上海',
  32: '江苏',
  33: '浙江',
  34: '安徽',
  35: '福建',
  36: '江西',
  37: '山东',
  41: '河南',
  42: '湖北',
  43: '湖南',
  44: '广东',
  45: '广西',
  46: '海南',
  50: '重庆',
  51: '四川',
  52: '贵州',
  53: '云南',
  54: '西藏',
  61: '陕西',
  62: '甘肃',
  63: '青海',
  64: '宁夏',
  65: '新疆',
  71: '台湾',
  81: '香港',
  82: '澳门',
  91: '国外',
}

/** 身份证前17位加权因子 */
const WEIGHT_FACTORS = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2]

/** 校验码对应表 */
const CHECK_CODES = ['1', '0', 'X', '9', '8', '7', '6', '5', '4', '3', '2']

/** 身份证正则：15位纯数字 或 18位前17位数字+末尾数字/X */
const ID_CARD_REGEX = /^(?:\d{15}|\d{17}[\dX])$/

/** 15位身份证提取年月日正则 */
const REGEX_15 = /^\d{6}(\d{2})(\d{2})(\d{2})\d{3}$/

/** 18位身份证提取年月日正则 */
const REGEX_18 = /^\d{6}(\d{4})(\d{2})(\d{2})\d{3}[\dX]$/

// ==================== 类型定义 ====================

/** 性别类型：1-男，2-女 */
export type Sex = 1 | 2

/** 区域选项 */
export interface AreaOption {
  value: string
  label: string
}

// ==================== 核心纯函数 ====================

/**
 * 计算身份证校验码
 * @param id17 身份证前17位
 */
function calculateCheckCode(id17: string): string {
  let sum = 0
  for (let i = 0; i < 17; i++) {
    sum += Number(id17[i]) * WEIGHT_FACTORS[i]
  }
  return CHECK_CODES[sum % 11]
}

/**
 * 校验日期合法性 (防止出现 2月30日 等非法日期)
 */
function isValidDate(year: number, month: number, day: number): boolean {
  const date = new Date(year, month - 1, day)
  // 通过比对输入值与 Date 反解出的值是否一致来判断合法性
  return (
    date.getFullYear() === year
    && date.getMonth() === month - 1
    && date.getDate() === day
  )
}

// ==================== 导出的业务函数 ====================

/**
 * 校验身份证号是否合法
 * @param cardNo 身份证号码
 * @param allowMasked 是否允许带掩码的身份证 (如: 110***1234)，默认 true
 */
export function isValidIdCard(cardNo: string, allowMasked = true): boolean {
  if (!cardNo)
    return false
  if (allowMasked && cardNo.includes('***'))
    return true

  const upperCardNo = cardNo.toUpperCase()

  // 1. 格式校验
  if (!ID_CARD_REGEX.test(upperCardNo))
    return false

  // 2. 省份校验
  const provinceCode = upperCardNo.slice(0, 2)
  if (!PROVINCE_MAP[provinceCode])
    return false

  // 3. 生日校验
  let year: number, month: number, day: number
  if (upperCardNo.length === 15) {
    const match = upperCardNo.match(REGEX_15)
    if (!match)
      return false
    year = 1900 + Number(match[1])
    month = Number(match[2])
    day = Number(match[3])
  }
  else {
    const match = upperCardNo.match(REGEX_18)
    if (!match)
      return false
    year = Number(match[1])
    month = Number(match[2])
    day = Number(match[3])
  }

  if (!isValidDate(year, month, day))
    return false

  // 年龄范围校验 (3岁 - 120岁)
  const currentYear = new Date().getFullYear()
  const age = currentYear - year
  if (age < 3 || age > 120)
    return false

  // 4. 校验位检测 (15位需先转18位进行校验)
  const id18 = convert15To18(upperCardNo)
  return calculateCheckCode(id18.slice(0, 17)) === id18[17]
}

/**
 * 15位身份证号转18位
 */
export function convert15To18(cardNo: string): string {
  if (cardNo.length !== 15)
    return cardNo

  const core17 = `${cardNo.slice(0, 6)}19${cardNo.slice(6)}`
  const checkCode = calculateCheckCode(core17)

  return core17 + checkCode
}

/**
 * 根据身份证号获取性别
 * @returns 1-男，2-女
 */
export function getSexFromIdCard(cardNo: string): Sex {
  // 如果是15位，先转18位统一逻辑
  const id18 = cardNo.length === 15 ? convert15To18(cardNo) : cardNo.toUpperCase()

  if (id18.length !== 18) {
    throw new Error('Invalid ID card number length')
  }

  // 18位身份证的第17位代表性别，奇数男，偶数女
  const genderDigit = Number(id18[16])
  return genderDigit % 2 === 0 ? 2 : 1
}

/** 直辖市列表 */
export const areaMunicipality: AreaOption[] = [
  { value: '110000', label: '北京市' },
  { value: '120000', label: '天津市' },
  { value: '310000', label: '上海市' },
  { value: '500000', label: '重庆市' },
]
