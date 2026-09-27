import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

/**
 * asar 热更发布工具：从 electron-builder 产物提取应用代码包 app.asar，
 * 生成发布物（版本化 asar + UpdateManifest 清单），与 AsarUpdateService 协议对齐。
 *   pnpm hotfix <app> [--version x.y.z]
 *   例如：pnpm hotfix funeral
 * 输出 dist/hotfix/<app>/：core-<version>.asar + update-manifest.json，
 * 二者一起上传到更新服务器的同一目录（updates.asar 指向清单，清单内 url 相对解析）。
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const args = process.argv.slice(2)
const app = args[0]
const versionFlagIndex = args.indexOf('--version')
const versionOverride = versionFlagIndex >= 0 ? args[versionFlagIndex + 1] : undefined

if (!app) {
  console.error('usage: pnpm hotfix <app> [--version x.y.z]')
  console.error('example: pnpm hotfix funeral')
  process.exit(1)
}

const appDir = join(ROOT, 'apps', app)
const pkgPath = join(appDir, 'package.json')
if (!existsSync(pkgPath)) {
  console.error(`apps/${app} 不存在`)
  process.exit(1)
}

const version = versionOverride ?? JSON.parse(readFileSync(pkgPath, 'utf-8')).version

// 1. 定位 electron-builder 产物里的应用代码包：
// 引导器架构（desktop）真实代码为 app.core.asar（app.asar 是永不更新的 KB 级引导器，不能当热更包）；
// 普通架构（funeral 等）直接用 app.asar
const unpackedResources = join(appDir, 'dist', 'win-unpacked', 'resources')
const coreAsar = join(unpackedResources, 'app.core.asar')
const asarSource = existsSync(coreAsar) ? coreAsar : join(unpackedResources, 'app.asar')
if (!existsSync(asarSource)) {
  console.error(`未找到 ${asarSource}`)
  console.error(`先执行 pnpm --filter @app/${app} build:win（或 build --dir）产出 app.asar`)
  process.exit(1)
}

// 2. 复制为版本化文件名（与 AsarUpdateService 的 asarFileName 同规则：下载即终名，引导器永不 rename）
const outDir = join(appDir, 'dist', 'hotfix')
mkdirSync(outDir, { recursive: true })
const asarName = `core-${version.replace(/[^\w.-]/g, '_')}.asar`
copyFileSync(asarSource, join(outDir, asarName))

// 3. sha256 强校验值（与 UpdateManifest.sha256 协议字段一致）
const sha256 = createHash('sha256').update(readFileSync(join(outDir, asarName))).digest('hex')

// 4. 清单：url 相对清单地址解析，部署时把两个文件放同一目录即可
const manifest = { version, url: `./${asarName}`, sha256 }
writeFileSync(join(outDir, 'update-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf-8')

console.log(`hotfix packaged: apps/${app}/dist/hotfix/`)
console.log(`  ${asarName}`)
console.log(`  update-manifest.json  (version=${version}, sha256=${sha256.slice(0, 12)}...)`)
console.log(`部署：两个文件上传到 updates.asar 指向的服务器目录`)
