#!/usr/bin/env node
/**
 * flavor 构建准备：把 FLAVOR 环境变量指定的产品清单写入构建环境。
 * electron-builder 的 ${env.FLAVOR} / ${env.FLAVOR_NAME} 由此导出（见 electron-builder.yml）。
 * 用法：FLAVOR=kiosk node scripts/prepare-flavor.mjs && electron-builder --win
 */
import { readFileSync } from 'node:fs'

const flavorId = process.env.FLAVOR ?? 'cemetery'
const flavor = JSON.parse(readFileSync(new URL(`../../apps/flavors/${flavorId}/flavor.json`, import.meta.url), 'utf-8'))

// electron-builder 读取本进程环境变量导出
process.env.FLAVOR_NAME = flavor.name
console.log(`[prepare-flavor] ${flavorId} → "${flavor.name}" (mode=${flavor.mode}, apps=${flavor.apps.length})`)
