/**
 * 应用会话与下载生命周期 e2e：纯策略函数 + 真实 AuditLog 落盘。
 * 不加载 electron（Electron 适配层由真机边界覆盖），全部结论来自退出码。
 *
 * 运行：pnpm test:e2e:session
 */
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { buildAppPermissionRules } from '../../packages/app-runtime/src/permission-rules.ts'
import { AUDIT_EVENTS, auditFileName, AuditLog, isAuditExpired } from '../../packages/kernel/src/audit/audit-log.ts'
import { applyProgress, progressPercent, pruneTasks, resolveCompletedPath, resolvePolicyDenial, resolveTerminal, safeFilename, shouldPushProgress } from '../../packages/kernel/src/download/download-policy.ts'
import { EventBus } from '../../packages/kernel/src/event-bus.ts'
import { cookieUrl, parseCookieSnapshot, serializeCookie } from '../../packages/kernel/src/session/cookie-snapshot.ts'

let passed = 0
let failed = 0

async function step(name, fn) {
  try {
    await fn()
    passed++
    console.log(`  PASS  ${name}`)
  }
  catch (err) {
    failed++
    console.log(`  FAIL  ${name}\n        ${err?.message ?? err}`)
  }
}

const logger = { warn: () => {}, info: () => {}, error: () => {}, debug: () => {} }
const FIXED_NOW = () => new Date('2026-11-09T10:00:00.000Z')

function task(overrides = {}) {
  return {
    id: 'dl-1',
    appId: 'clinic-reg',
    filename: 'report.pdf',
    path: '/downloads/report.pdf',
    received: 0,
    total: 100,
    percent: 0,
    status: 'progressing',
    startedAt: 1000,
    ...overrides,
  }
}

function withDir(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'session-e2e-'))
  try { return fn(dir) }
  finally { rmSync(dir, { recursive: true, force: true }) }
}

await step('cookieUrl：点前缀域去点、secure 决定协议、缺省 path 补 /', () => {
  assert.equal(cookieUrl({ domain: '.example.com', path: '/app', secure: true }), 'https://example.com/app')
  assert.equal(cookieUrl({ domain: 'example.com' }), 'http://example.com/')
})

await step('serializeCookie 保留字段，非法 sameSite 收敛为未设置', () => {
  const stored = serializeCookie({
    name: 'sid',
    value: 'abc',
    domain: '.example.com',
    path: '/',
    secure: true,
    httpOnly: true,
    expirationDate: 1_800_000_000,
    sameSite: 'lax',
  })
  assert.equal(stored.url, 'https://example.com/')
  assert.equal(stored.name, 'sid')
  assert.equal(stored.sameSite, 'lax')
  assert.equal(stored.expirationDate, 1_800_000_000)
  assert.equal(serializeCookie({ name: 'x', value: 'y', sameSite: 'bogus' }).sameSite, undefined)
})

await step('parseCookieSnapshot 跳过畸形项、非数组返回空表', () => {
  assert.deepEqual(parseCookieSnapshot('not-array'), [])
  assert.deepEqual(parseCookieSnapshot([{ url: 'https://a', name: 'n', value: 'v' }, null, { name: 'bad' }, 3]), [
    { url: 'https://a', name: 'n', value: 'v' },
  ])
})

await step('safeFilename：Unix/Windows 目录段与控制字符一律剥离', () => {
  assert.equal(safeFilename('../../etc/passwd'), 'passwd')
  assert.equal(safeFilename('C:\\Windows\\evil.exe'), 'evil.exe')
  assert.equal(safeFilename('re\u0000port\u007F.pdf'), 'report.pdf')
  assert.equal(safeFilename(''), 'download')
})

await step('progressPercent / shouldPushProgress / applyProgress', () => {
  assert.equal(progressPercent(50, 100), 50)
  assert.equal(progressPercent(200, 100), 100)
  assert.equal(progressPercent(10, 0), -1)
  assert.equal(shouldPushProgress(1000, 1499, 500), false)
  assert.equal(shouldPushProgress(1000, 1500, 500), true)
  const next = applyProgress(task(), 25, 0)
  assert.equal(next.percent, 25)
  assert.equal(next.total, 100)
})

await step('resolveTerminal 与策略拒绝改判（已完成也改判）', () => {
  const done = resolveTerminal(task(), 'completed', 2000)
  assert.equal(done.status, 'completed')
  assert.equal(done.finishedAt, 2000)
  const denied = resolvePolicyDenial(done, 2100)
  assert.equal(denied.status, 'cancelled')
  assert.equal(denied.reason, 'policy')
  assert.equal(resolveTerminal(task(), 'failed', 2000, 'disk-full').reason, 'disk-full')
})

await step('pruneTasks：过期终态裁剪、进行中永不裁掉', () => {
  const tasks = [
    task({ id: 'p1', status: 'progressing', startedAt: 1 }),
    task({ id: 'old', status: 'completed', finishedAt: 1000, startedAt: 2 }),
    task({ id: 'fresh', status: 'completed', finishedAt: 95_000, startedAt: 3 }),
    task({ id: 'p2', status: 'progressing', startedAt: 4 }),
  ]
  const kept = pruneTasks(tasks, 100_000, 2, 30_000)
  assert.deepEqual(kept.map(t => t.id), ['p1', 'p2'])
})

await step('resolveCompletedPath：saveAs 自选目录可用，未完成任务与缺失文件拒绝', () => {
  const exists = p => p === '/custom/dir/report.pdf'
  assert.equal(
    resolveCompletedPath(task({ status: 'completed', path: '/custom/dir/report.pdf' }), exists),
    '/custom/dir/report.pdf',
  )
  assert.throws(() => resolveCompletedPath(task(), exists), /未完成/)
  assert.throws(() => resolveCompletedPath(task({ status: 'completed', path: '/missing/x.pdf' }), exists), /不存在/)
})

await step('审计文件名与过期判定，白名单排除高频快照', () => {
  assert.equal(auditFileName(FIXED_NOW()), 'audit-2026-11-09.jsonl')
  const now = FIXED_NOW().getTime()
  assert.equal(isAuditExpired('audit-2020-01-01.jsonl', now, 30), true)
  assert.equal(isAuditExpired('audit-2026-11-08.jsonl', now, 30), false)
  assert.equal(isAuditExpired('notes.txt', now, 30), false)
  assert.ok(AUDIT_EVENTS.has('permission.decided'))
  assert.ok(AUDIT_EVENTS.has('download.failed'))
  assert.ok(!AUDIT_EVENTS.has('download.tasks-changed'))
})

await step('真实 AuditLog：白名单落盘、非白名单不落盘、退订后停写、过期文件清理', async () => withDir(async (dir) => {
  const events = new EventBus()
  const audit = new AuditLog({ events, logger, dir, now: FIXED_NOW, retentionDays: 30 })
  writeFileSync(join(dir, 'audit-2020-01-01.jsonl'), '{}\n')
  await audit.start()
  assert.equal(existsSync(join(dir, 'audit-2020-01-01.jsonl')), false)
  events.emit('permission.decided', { appId: 'clinic-reg', permission: 'download', verdict: 'deny', source: 'default' })
  events.emit('download.tasks-changed', { tasks: [] })
  events.emit('download.completed', { taskId: 'dl-1', appId: 'clinic-reg', filename: 'report.pdf' })
  await audit.stop()
  events.emit('app.opened', { appId: 'clinic-reg', instanceId: 'i-1' })

  const file = join(dir, auditFileName(FIXED_NOW()))
  assert.ok(existsSync(file))
  const lines = readFileSync(file, 'utf-8').trim().split('\n').map(line => JSON.parse(line))
  assert.deepEqual(lines.map(l => l.event), ['permission.decided', 'download.completed'])
  assert.equal(lines[0].ts, '2026-11-09T10:00:00.000Z')
  assert.equal(lines[0].payload.permission, 'download')
}))

await step('下载门控的数据基础：未声明 download 权限的应用不产生放行规则', () => {
  const manifest = {
    id: 'clinic-reg',
    name: '登记台',
    version: '1.0.0',
    entry: { kind: 'embedded', route: '/reg' },
    devices: [],
    permissions: ['notifications'],
  }
  const rules = buildAppPermissionRules([manifest])
  assert.ok(!rules.some(r => r.permission === 'download'))
  const withDownload = buildAppPermissionRules([{ ...manifest, permissions: ['download'] }])
  assert.ok(withDownload.some(r => r.permission === 'download' && r.verdict === 'allow'))
})

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed ? 1 : 0)
