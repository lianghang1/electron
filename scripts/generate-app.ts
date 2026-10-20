import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import process from 'node:process'
import { createInterface } from 'node:readline/promises'
import { fileURLToPath } from 'node:url'
import { syncDevResources } from './sync-dev-resources'

/**
 * 新 App 脚手架：按模板树生成与形态同构的单应用骨架。
 *   pnpm gen:app                          → 交互式向导（推荐，防参数遗漏）
 *   pnpm gen:app <slug> <中文名> [--desktop] → 参数直通（CI / 熟手）
 *   例如：pnpm gen:app census 人口普查自助终端（Kiosk：全屏 + 韧性 + 无 Tab）
 *   例如：pnpm gen:app manager 运营管理台 --desktop（Desktop Shell：Tab 多应用 + 应用中心）
 * Desktop Shell 的 Shell 本体内置于 packages/ui（mountShellApp），应用侧 renderer 零 Shell 代码。
 * 完成后执行 pnpm install 建立 workspace 链接。
 *
 * 模板即真实文件（可直接编辑、lint、diff），令牌 @@XXX@@ 在生成时替换
 * （不用 __XXX__：会与 vite define 全局常量 __VITE_API_BASE_URL__ 等命名冲突）。
 * 生成后自检：残留令牌扫描 + package.json 合法性 + .cjs 语法 + identity 导出断言——
 * 模板扩展漏改令牌会在生成时立刻报错并回滚，而不是生成一个静默残缺的应用。
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const APPS_DIR = join(ROOT, 'apps')

const SLUG_RE = /^[a-z][a-z0-9-]*$/
const args = process.argv.slice(2)
const argDesktop = args.includes('--desktop')
const positional = args.filter(arg => arg !== '--desktop')
/** 两个位置参数齐备即直通；否则进交互向导 */
const interactive = positional.length < 2

function normalizeSlug(raw: string): string {
  return raw.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

/** 带行缓冲的问答读取器：readline 的 question 不缓存预灌入的行（管道喂入会丢行），自行排队 */
interface LineReader {
  ask: (prompt: string) => Promise<string>
  close: () => void
}

function createLineReader(): LineReader {
  const buffered: string[] = []
  let waiter: ((line: string) => void) | null = null
  let eof = false
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  rl.on('line', (line) => {
    if (waiter !== null) {
      const resolve = waiter
      waiter = null
      resolve(line)
    }
    else {
      buffered.push(line)
    }
  })
  rl.on('close', () => {
    eof = true
    if (waiter !== null) {
      const resolve = waiter
      waiter = null
      resolve('')
    }
  })
  return {
    ask(prompt) {
      process.stdout.write(prompt)
      const line = buffered.shift()
      if (line !== undefined) { return Promise.resolve(line) }
      // EOF 后无输入可给：交互无法继续，显式中止（否则校验循环会无限重问）
      if (eof) {
        console.error('\n[gen:app] 输入流已结束，交互中止')
        process.exit(1)
      }
      return new Promise((resolve) => { waiter = resolve })
    },
    close() {
      rl.close()
    },
  }
}

async function askShape(lr: LineReader): Promise<boolean> {
  console.log('\n选择应用形态：')
  console.log('  1) Kiosk         全屏单应用（业务自助终端，缺省）')
  console.log('  2) Desktop Shell Tab 多应用框架（运营管理台类）')
  for (;;) {
    const answer = (await lr.ask(`形态 [1/2]（回车=${argDesktop ? 2 : 1}）: `)).trim()
    if (answer === '') { return argDesktop }
    if (answer === '1') { return false }
    if (answer === '2') { return true }
    console.log('  无效输入，请输入 1 或 2')
  }
}

async function askSlug(lr: LineReader): Promise<string> {
  console.log(`\n已有应用：${readdirSync(APPS_DIR).join('、')}`)
  for (;;) {
    const raw = (await lr.ask('应用标识 slug（kebab-case，如 census）: ')).trim()
    if (raw === '') {
      console.log('  slug 不能为空')
      continue
    }
    const normalized = normalizeSlug(raw)
    if (normalized !== raw && SLUG_RE.test(normalized)) {
      const adopted = (await lr.ask(`  自动规范化为 "${normalized}"，回车采用或重新输入: `)).trim()
      if (adopted === '') {
        return normalized
      }
      if (SLUG_RE.test(adopted)) {
        if (existsSync(join(APPS_DIR, adopted))) {
          console.log(`  apps/${adopted} 已存在`)
          continue
        }
        return adopted
      }
      console.log('  输入无效，请重新输入')
      continue
    }
    if (!SLUG_RE.test(raw)) {
      console.log(`  "${raw}" 需 kebab-case（小写字母开头，仅含小写字母 / 数字 / 连字符）`)
      continue
    }
    if (existsSync(join(APPS_DIR, raw))) {
      console.log(`  apps/${raw} 已存在`)
      continue
    }
    return raw
  }
}

async function askDisplayName(lr: LineReader): Promise<string> {
  for (;;) {
    const name = (await lr.ask('应用中文名（窗口标题，如 人口普查自助终端）: ')).trim()
    if (name !== '') { return name }
    console.log('  不能为空')
  }
}

let slug = ''
let displayName = ''
let isDesktop = argDesktop

/** 填充 slug / displayName / isDesktop：参数直通或交互向导（取消时 process.exit） */
async function resolveOptions(): Promise<void> {
  if (!interactive) {
    ;[slug, displayName] = positional
    isDesktop = argDesktop
    return
  }
  const lr = createLineReader()
  try {
    isDesktop = await askShape(lr)
    slug = await askSlug(lr)
    displayName = await askDisplayName(lr)
    const productName = slug.split('-').map(part => part.charAt(0).toUpperCase() + part.slice(1)).join('')
    console.log('\n将生成：')
    console.log(`  目录        apps/${slug}`)
    console.log(`  形态        ${isDesktop ? 'Desktop Shell（Tab 多应用框架）' : 'Kiosk（全屏单应用）'}`)
    console.log(`  appId       com.company.${slug}`)
    console.log(`  productName ${productName}（ASCII；面向用户的中文见窗口标题）`)
    const confirmed = (await lr.ask('确认生成 [Y/n]: ')).trim()
    if (confirmed !== '' && confirmed !== 'y' && confirmed !== 'Y') {
      console.log('已取消')
      process.exit(0)
    }
  }
  finally {
    lr.close()
  }
}

function generate(): void {
  if (!SLUG_RE.test(slug)) {
    console.error(`invalid slug "${slug}": 需 kebab-case（小写字母开头，仅含小写字母 / 数字 / 连字符）`)
    process.exit(1)
  }

  const appDir = join(APPS_DIR, slug)
  if (existsSync(appDir)) {
    console.error(`apps/${slug} 已存在`)
    process.exit(1)
  }

  const TEMPLATE_DIR = join(ROOT, 'scripts', 'templates', isDesktop ? 'desktop' : 'app')

  /** productName / executableName 必须 ASCII（electron-builder 对非 ASCII productName 强制回退 sanitize 名） */
  const productName = slug.split('-').map(part => part.charAt(0).toUpperCase() + part.slice(1)).join('')
  const appId = `com.company.${slug}`

  const TOKENS: Record<string, string> = {
    '@@SLUG@@': slug,
    '@@APP_ID@@': appId,
    '@@PRODUCT_NAME@@': productName,
    '@@DISPLAY_NAME@@': displayName,
  }

  function listTemplateFiles(dir: string, base = ''): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const rel = base ? `${base}/${entry.name}` : entry.name
      return entry.isDirectory() ? listTemplateFiles(join(dir, entry.name), rel) : [rel]
    })
  }

  function render(content: string): string {
    return content.replace(/@@(SLUG|APP_ID|PRODUCT_NAME|DISPLAY_NAME)@@/g, (_, key: string) => TOKENS[`@@${key}@@`])
  }

  function fail(message: string): never {
    console.error(`[gen:app] ${message}`)
    // 自检失败回滚：删除半成品应用目录，避免未替换的 catalog 依赖污染后续 pnpm install
    if (existsSync(appDir)) { rmSync(appDir, { recursive: true, force: true }) }
    process.exit(1)
  }

  /** 生成后自检：模板扩展遗漏在此立刻暴露 */
  function verifyGenerated(files: string[]): void {
    for (const rel of files) {
      const content = readFileSync(join(appDir, rel), 'utf-8')
      const leftover = content.match(/@@[A-Z][A-Z_]*@@/g)
      if (leftover) { fail(`${rel} 存在未替换令牌 ${[...new Set(leftover)].join(', ')}——检查模板与 TOKENS 是否同步`) }
    }

    const pkg = JSON.parse(readFileSync(join(appDir, 'package.json'), 'utf-8')) as { name: string, main: string }
    if (pkg.name !== `@app/${slug}`) { fail(`package.json name 异常: ${pkg.name}`) }
    // main 指向构建产物（生成时尚未构建），校验契约值而非文件存在性
    if (pkg.main !== './out/main/index.cjs') { fail(`package.json main 异常: ${pkg.main}（CJS 入口契约）`) }

    for (const rel of files.filter(file => file.endsWith('.cjs'))) {
      const check = spawnSync(process.execPath, ['--check', join(appDir, rel)], { encoding: 'utf-8' })
      if (check.status !== 0) { fail(`${rel} 语法错误:\n${check.stderr}`) }
    }

    // identity 是身份唯一真源：值与输入一致才算生成成功
    const identity = createRequire(import.meta.url)(join(appDir, 'electron/identity.cjs')) as {
      appId: string
      productName: string
      displayName: string
    }
    if (identity.appId !== appId || identity.productName !== productName || identity.displayName !== displayName) { fail(`identity.cjs 导出与参数不一致: ${JSON.stringify(identity)}`) }
  }

  const templateFiles = listTemplateFiles(TEMPLATE_DIR)
  try {
    for (const rel of templateFiles) {
      const target = join(appDir, rel)
      mkdirSync(dirname(target), { recursive: true })
      writeFileSync(target, render(readFileSync(join(TEMPLATE_DIR, rel), 'utf-8')))
    }

    // 统一莲花占位图标（正式图标用 resources/brand/generate.ts 流程生成后替换）：
    // build/icon.png 供 linux deb 与 main 经 ?asset 构建进 out（窗口/托盘图标）；
    // build/icon.ico 供 NSIS/exe。不放 resources/——那是主进程默认 publicDir，其内
    // ?asset 不复制文件进 out，打包后路径在 asar 内失效致托盘无图标
    const kioskDir = join(APPS_DIR, 'funeral-kiosk')
    cpSync(join(kioskDir, 'build/icon.png'), join(appDir, 'build/icon.png'))
    cpSync(join(kioskDir, 'build/icon.ico'), join(appDir, 'build/icon.ico'))

    // 设备资源无需生成：resources/devices 由同步脚本从 devices 树 assets 真源单向复制（postinstall 也会自动执行）
    syncDevResources()

    verifyGenerated(templateFiles)
  }
  catch (error) {
    rmSync(appDir, { recursive: true, force: true })
    console.error('[gen:app] 生成失败，已回滚删除半成品目录')
    throw error
  }

  console.log(`created apps/${slug}`)
  console.log(`  形态        ${isDesktop ? 'Desktop Shell（Tab 多应用框架）' : 'Kiosk（全屏单应用）'}`)
  console.log(`  appId       ${appId}`)
  console.log(`  productName ${productName}（ASCII，面向用户的中文见窗口标题）`)
  console.log(`next: pnpm install → pnpm --filter @app/${slug} dev`)
  if (isDesktop) {
    console.log('提示: 业务入口在 electron/main/index.ts 的 apps.manifests 声明（写法参照 apps/desktop）')
  }
}

void resolveOptions().then(generate)
