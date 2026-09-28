import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import process from 'node:process'
import readline from 'node:readline/promises'
import { fileURLToPath } from 'node:url'

/**
 * asar 热更发布工具
 *   pnpm hotfix                ← 交互引导（选 App → 确认版本 → 自动打包出发布物）
 *   pnpm hotfix funeral        ← 直通模式（非交互，CI/熟手用），参数兼容 @app/funeral
 *   --version 1.0.1            ← 覆盖发布版本（默认取 package.json version）
 *   --no-build                 ← 跳过打包，直接用现有产物（仅调试用）
 * 输出 apps/<app>/dist/hotfix/：core-<version>.asar + update-manifest.json，
 * 二者一起上传到更新服务器（updates.asar 指向清单所在目录）即完成发布。
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const APPS_DIR = join(ROOT, 'apps')

interface AppMeta {
  dir: string
  productName: string
  version: string
}

/** 读取 app 元信息（无 package.json 或无 build:win 打包能力的目录不算 app） */
function readAppMeta(dir: string): AppMeta | null {
  const pkgPath = join(APPS_DIR, dir, 'package.json')
  if (!existsSync(pkgPath))
    return null
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as {
    productName?: string
    version?: string
    scripts?: Record<string, string>
  }
  if (!pkg.scripts?.['build:win'])
    return null
  return { dir, productName: pkg.productName ?? dir, version: pkg.version ?? '0.0.0' }
}

function listApps(): AppMeta[] {
  return readdirSync(APPS_DIR)
    .filter(dir => !dir.startsWith('.'))
    .map(readAppMeta)
    .filter((meta): meta is AppMeta => meta !== null)
}

function findApp(appArg?: string): AppMeta | undefined {
  return listApps().find(meta => meta.dir === appArg?.replace(/^@app\//, ''))
}

function buildApp(app: AppMeta): void {
  console.log(`\n打包 @app/${app.dir} (win) 中，约 1-3 分钟...`)
  const build = spawnSync('pnpm', ['--filter', `@app/${app.dir}`, 'build:win'], {
    cwd: ROOT,
    stdio: 'inherit',
    shell: true, // Windows 下 pnpm 是 pnpm.cmd，需 shell 解析
  })
  if (build.status !== 0) {
    console.error('\n打包失败')
    console.error('若报 EBUSY / win-unpacked 被占用：先关闭运行中的 App 进程后重试')
    process.exit(build.status ?? 1)
  }
}

function packHotfix(app: AppMeta, version: string): void {
  // 引导器架构（全 app 已统一）：真实代码为 app.core.asar；app.asar 是永不更新的引导器，不能当热更包
  const unpackedResources = join(APPS_DIR, app.dir, 'dist', 'win-unpacked', 'resources')
  const coreAsar = join(unpackedResources, 'app.core.asar')
  const asarSource = existsSync(coreAsar) ? coreAsar : join(unpackedResources, 'app.asar')
  if (!existsSync(asarSource)) {
    console.error(`未找到打包产物 ${asarSource}`)
    console.error('请重跑（去掉 --no-build，脚本会自动打包）')
    process.exit(1)
  }

  const outDir = join(APPS_DIR, app.dir, 'dist', 'hotfix')
  mkdirSync(outDir, { recursive: true })
  const asarName = `core-${version.replace(/[^\w.-]/g, '_')}.asar`
  copyFileSync(asarSource, join(outDir, asarName))

  // sha256 强校验（与 AsarUpdateService 的 UpdateManifest.sha256 协议对齐）
  const sha256 = createHash('sha256').update(readFileSync(join(outDir, asarName))).digest('hex')
  const manifest = { version, url: `./${asarName}`, sha256 }
  writeFileSync(join(outDir, 'update-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf-8')

  console.log(`\n热更发布物已生成: apps/${app.dir}/dist/hotfix/`)
  console.log(`  core-${version}.asar`)
  console.log(`  update-manifest.json  (version=${version}, sha256=${sha256.slice(0, 12)}...)`)
  console.log('部署：把这两个文件一起上传到 updates.asar 指向的服务器目录，发布完成')
}

/** 交互式选择 App（编号或名称，兼容 @app/ 前缀写法） */
async function selectApp(rl: readline.Interface): Promise<AppMeta> {
  const apps = listApps()
  console.log('\n可用 App：')
  apps.forEach((meta, i) => console.log(`  ${i + 1}. ${meta.dir}  ${meta.productName}`))
  for (;;) {
    const raw = (await rl.question('\n选择要发布的 App（编号或名称）: ')).trim()
    const picked = apps[Number(raw) - 1] ?? findApp(raw)
    if (picked)
      return picked
    console.log(`无效选择「${raw}」，请输入列表中的编号或名称`)
  }
}

/** 确认发布版本（热更版本必须高于客户端已装版本，否则客户端判定已是最新） */
async function confirmVersion(rl: readline.Interface, app: AppMeta, fallback: string): Promise<string> {
  console.log(`\npackage.json 当前版本: ${app.version}`)
  console.log('提示：热更版本必须高于客户端已安装版本（如 1.0.0 → 1.0.1）')
  for (;;) {
    const raw = (await rl.question(`发布版本（回车 = ${fallback}）: `)).trim()
    if (!raw)
      return fallback
    if (/^\d+\.\d+\.\d+(?:-[\w.]+)?$/.test(raw))
      return raw
    console.log(`「${raw}」不是合法版本号（如 1.0.1）`)
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const versionFlagIndex = args.indexOf('--version')
  const versionOverride = versionFlagIndex >= 0 ? args[versionFlagIndex + 1] : undefined
  // 剔除 --version 及其值（仅当存在时）后，第一个非选项参数即 app 名
  const appArg = args
    .filter((arg, i) => !(versionFlagIndex >= 0 && (i === versionFlagIndex || i === versionFlagIndex + 1)))
    .find(arg => !arg.startsWith('-'))
  const app = findApp(appArg)
  const interactive = process.stdin.isTTY && args.length === 0

  // 直通模式：pnpm hotfix <app> [--version x.y.z] [--no-build]
  if (!interactive) {
    if (!app) {
      const dirs = listApps().map(meta => meta.dir).join(' / ')
      console.error(`usage: pnpm hotfix <app>（可用: ${dirs}）`)
      console.error('或直接运行 pnpm hotfix 进入交互引导')
      process.exit(1)
    }
    const version = versionOverride ?? app.version
    if (!args.includes('--no-build'))
      buildApp(app)
    packHotfix(app, version)
    return
  }

  // 交互引导：pnpm hotfix
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  try {
    const picked = await selectApp(rl)
    const version = versionOverride ?? await confirmVersion(rl, picked, picked.version)
    buildApp(picked)
    packHotfix(picked, version)
  }
  finally {
    rl.close()
  }
}

main()
