/**
 * 身份与权限闭环 e2e：调用方账本、路由层授权闸门、平台规则、系统权限映射。
 *
 * 运行：pnpm test:e2e:caller
 */
import assert from 'node:assert/strict'
import process from 'node:process'
import { z } from 'zod'
import { buildAppPermissionRules, buildPlatformPermissionRules } from '../../packages/app-runtime/src/permission-rules.ts'
import { PermissionService } from '../../packages/app-runtime/src/permission-service.ts'
import { createDomainRouter, DomainRouteError } from '../../packages/devices/src/domain-kit.ts'
import { CallerRegistry, domainGrant, sessionToPlatformPermission, SHELL_APP_ID } from '../../packages/shared/src/caller.ts'

let passed = 0
let failed = 0
async function step(name, fn) {
  try {
    await fn()
    passed++
    process.stdout.write(`  PASS  ${name}\n`)
  }
  catch (err) {
    failed++
    process.stdout.write(`  FAIL  ${name}: ${err.message}\n`)
  }
}

const logger = { debug() {}, info() {}, warn() {}, error() {} }
const app = (id, devices = [], permissions = []) => ({ id, devices, permissions, type: 'internal' })

// 最小域定义：两个方法，一个用缺省 grant（domain.idcard），一个显式 grant（idcard.admin）
const domains = [{
  name: 'idcard',
  methods: {
    read: { input: z.object({ deviceId: z.string() }), output: z.unknown(), handler: () => ({ ok: true }) },
    admin: { input: z.object({}), output: z.unknown(), grant: 'idcard.admin', handler: () => ({ ok: true }) },
  },
}]

process.stdout.write('\n身份与权限闭环 e2e\n\n')

await step('调用方账本：登记 / 反查 / 注销，未登记即拒绝', () => {
  const registry = new CallerRegistry()
  registry.register(7, { appId: 'demo', instanceId: 'inst-1', kind: 'view' })
  assert.deepEqual(registry.resolve(7), { appId: 'demo', instanceId: 'inst-1', kind: 'view' })
  assert.equal(registry.tryResolve(99), undefined)
  assert.throws(() => registry.resolve(99), /未登记/)
  registry.unregister(7)
  assert.equal(registry.tryResolve(7), undefined)
})

await step('grant 推导：缺省按域，显式声明优先', () => {
  assert.equal(domainGrant('idcard'), 'domain.idcard')
  assert.equal(domainGrant('idcard', 'idcard.admin'), 'idcard.admin')
})

await step('系统权限映射：只认白名单内的 Chromium 权限', () => {
  assert.equal(sessionToPlatformPermission('media'), 'media')
  assert.equal(sessionToPlatformPermission('clipboard-read'), 'clipboard.read')
  assert.equal(sessionToPlatformPermission('serial'), undefined)
})

await step('平台规则：shell 只放行能力矩阵内已启用的域', () => {
  const rules = buildPlatformPermissionRules(['idcard', 'print'])
  assert.equal(rules.some(r => r.app === SHELL_APP_ID && r.permission === 'domain.idcard'), true)
  assert.equal(rules.some(r => r.app === SHELL_APP_ID && r.permission === 'domain.signature'), false)
})

await step('路由闸门：能力矩阵外的域在授权前即拒绝', async () => {
  const router = createDomainRouter(domains, logger, { availableDomains: ['print'] })
  await assert.rejects(
    () => router.call('idcard.read', { deviceId: 'r1' }, { appId: 'x', instanceId: 'i', log() {} }),
    err => err instanceof DomainRouteError && err.code === 'DOMAIN_UNAVAILABLE',
  )
})

await step('路由闸门：授权回调收到方法级 grant，拒绝即 PERMISSION_DENIED', async () => {
  const seen = []
  const router = createDomainRouter(domains, logger, {
    availableDomains: ['idcard'],
    authorize: async (grant, ctx) => { seen.push([grant, ctx.appId]); return false },
  })
  const ctx = { appId: 'demo', instanceId: 'i', log() {} }
  await assert.rejects(
    () => router.call('idcard.admin', {}, ctx),
    err => err instanceof DomainRouteError && err.code === 'PERMISSION_DENIED',
  )
  assert.deepEqual(seen[0], ['idcard.admin', 'demo'])
})

await step('路由闸门：缺省 grant 传 domain.<域>，与策略表同源', async () => {
  const seen = []
  const router = createDomainRouter(domains, logger, {
    availableDomains: ['idcard'],
    authorize: async (grant) => { seen.push(grant); return true },
  })
  await router.call('idcard.read', { deviceId: 'r1' }, { appId: 'demo', instanceId: 'i', log() {} })
  assert.deepEqual(seen, ['domain.idcard'])
})

await step('真实链路：声明 idcard 的应用放行，未声明的应用被拒', async () => {
  const svc = new PermissionService({
    rules: [
      ...buildAppPermissionRules([app('declared', ['idcard']), app('undeclared', [])]),
      ...buildPlatformPermissionRules(['idcard']),
    ],
  })
  const router = createDomainRouter(domains, logger, {
    availableDomains: ['idcard'],
    authorize: (grant, ctx) => svc.decide({ appId: ctx.appId, origin: `app://${ctx.appId}`, permission: grant }),
  })
  const call = appId => router.call('idcard.read', { deviceId: 'r1' }, { appId, instanceId: 'i', log() {} })
  assert.deepEqual(await call('declared'), { ok: true })
  assert.deepEqual(await call(SHELL_APP_ID), { ok: true })
  await assert.rejects(() => call('undeclared'), err => err.code === 'PERMISSION_DENIED')
  await assert.rejects(() => call('ghost'), err => err.code === 'PERMISSION_DENIED')
})

await step('真实链路：显式 grant 未在任何清单声明时一律拒绝', async () => {
  const svc = new PermissionService({
    rules: [
      ...buildAppPermissionRules([app('declared', ['idcard'], ['idcard.admin'])]),
      ...buildPlatformPermissionRules(['idcard']),
    ],
  })
  const router = createDomainRouter(domains, logger, {
    availableDomains: ['idcard'],
    authorize: (grant, ctx) => svc.decide({ appId: ctx.appId, origin: `app://${ctx.appId}`, permission: grant }),
  })
  const ctx = appId => ({ appId, instanceId: 'i', log() {} })
  assert.deepEqual(await router.call('idcard.admin', {}, ctx('declared')), { ok: true })
  await assert.rejects(() => router.call('idcard.admin', {}, ctx(SHELL_APP_ID)), err => err.code === 'PERMISSION_DENIED')
})

await step('真实链路：入参校验仍在授权之后生效', async () => {
  const router = createDomainRouter(domains, logger, { availableDomains: ['idcard'] })
  await assert.rejects(
    () => router.call('idcard.read', {}, { appId: 'x', instanceId: 'i', log() {} }),
    err => err.code === 'INVALID_INPUT',
  )
})

process.stdout.write(`\n${passed} passed, ${failed} failed\n`)
process.exitCode = failed > 0 ? 1 : 0
