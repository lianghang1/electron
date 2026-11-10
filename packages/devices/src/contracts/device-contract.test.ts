/**
 * P0 契约基线：重构前后都跑同一份断言。
 * 稳定性来自能力 id 与输入边界，不来自方法名；改名后只需把 CONTRACT_PHASE
 * 切到 target，全部断言原样重放，任何方法漏改、schema 漂移、越界校验丢失都会红灯。
 */
import type { CapabilityContract } from './device-contract'
import { describe, expect, it } from 'vitest'
import {
  activeName,
  CAPABILITIES,
  collectMethodSchemas,
  CONTRACT_PHASE,
  RENAME_MAP,
} from './device-contract'

const schemas = collectMethodSchemas()

describe('设备对外能力契约基线', () => {
  it('恰好 38 项能力，id 唯一、方法名唯一', () => {
    expect(CAPABILITIES).toHaveLength(38)
    expect(new Set(CAPABILITIES.map(c => c.id)).size).toBe(38)
    expect(new Set(CAPABILITIES.map(c => activeName(c))).size).toBe(38)
    expect(new Set(CAPABILITIES.map(c => c.targetName)).size).toBe(38)
  })

  it('改名表完整且无自映射死角以外的歧义', () => {
    expect(Object.keys(RENAME_MAP)).toHaveLength(38)
    for (const c of CAPABILITIES) {
      expect(RENAME_MAP[c.legacyName]).toBe(c.targetName)
    }
  })

  it('当前生效的方法名与运行时域方法表完全一致（不多不少）', () => {
    const actual = [...schemas.keys()].sort()
    const expected = CAPABILITIES.map(c => activeName(c)).sort()
    expect(actual).toEqual(expected)
  })

  for (const c of CAPABILITIES) {
    it(`${c.id} —— ${activeName(c)} 入参边界`, () => {
      const schema = schemas.get(activeName(c))
      expect(schema, `缺少方法 ${activeName(c)}`).toBeDefined()
      if (!schema) { return }
      for (const input of c.accepted) {
        expect(schema.safeParse(input).success, `应接受的入参被拒：${JSON.stringify(input)}`).toBe(true)
      }
      for (const input of c.rejected ?? []) {
        expect(schema.safeParse(input).success, `应拒绝的入参被放行：${JSON.stringify(input)}`).toBe(false)
      }
    })
  }
})

/** 供 P2 切换后复用的断言入口：传入 target 阶段再次全量重放。 */
export function assertContractAtPhase(phase: 'legacy' | 'target', c: CapabilityContract): void {
  const name = activeName(c, phase)
  const schema = collectMethodSchemas().get(name)
  expect(schema, `缺少方法 ${name}`).toBeDefined()
  if (!schema) { return }
  for (const input of c.accepted) { expect(schema.safeParse(input).success).toBe(true) }
  for (const input of c.rejected ?? []) { expect(schema.safeParse(input).success).toBe(false) }
}

it('契约阶段常量在 P0 为 legacy', () => {
  expect(CONTRACT_PHASE).toBe('legacy')
})
