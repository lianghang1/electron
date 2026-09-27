/**
 * electron-builder afterPack 薄壳：electron-builder 校验钩子路径必须在 projectDir 内，
 * 共享实现（packages/core/scripts/after-pack.cjs）经包名 require 接入，全部逻辑见彼处。
 */
module.exports = require('@desktop/core/scripts/after-pack.cjs')
