import CryptoJS from 'crypto-js'

/**
 * 字符串转16进制
 * @param str
 * @returns hex string
 */
export function stringToHex(str: string) {
  return CryptoJS.enc.Utf8.parse(str).toString(CryptoJS.enc.Hex)
}

/**
 * 16进制转字符串
 * @param hex
 * @returns string
 */
export function hexToString(hex: string) {
  return CryptoJS.enc.Hex.parse(hex).toString(CryptoJS.enc.Utf8)
}

/**
 * base64编码
 * @param word
 * @returns base64 string
 */
export function base64Encode(word: string) {
  const words = CryptoJS.enc.Utf8.parse(word)
  return CryptoJS.enc.Base64.stringify(words)
}

/**
 * AES加密
 * @param plainText
 * @param key
 * @returns encrypted string
 */
export function encryptWithAES(plainText: string, key: string) {
  const textWord = CryptoJS.enc.Utf8.parse(plainText)
  const secretKey = CryptoJS.enc.Utf8.parse(key)
  const encrypted = CryptoJS.AES.encrypt(textWord, secretKey, {
    mode: CryptoJS.mode.ECB,
    padding: CryptoJS.pad.Pkcs7,
  })
  return encrypted.toString()
}
