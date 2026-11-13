import { readFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'
import { app } from 'electron'
import { logLine } from './marks.mjs'
import { bootSequence } from './sequence.mjs'

const dir = path.join(app.getPath('userData'), 'updater')
// 引导器在 app.asar/out/main，真实代码包是 resources/app.core.asar（after-pack 改名而来）
const builtinRoot = path.join(process.resourcesPath, 'app.core.asar')
const builtinVersion = app.getVersion()

function resourcesVersion() {
  try {
    return readFileSync(path.join(process.resourcesPath, 'resources', '.resources-version'), 'utf8').trim()
  }
  catch {
    return null
  }
}

void bootSequence({
  dir,
  builtinRoot,
  builtinVersion,
  log: message => logLine(dir, message),
  loadCore: async (candidate) => {
    const entry = path.join(candidate.root, 'out', 'main', 'index.js')
    const core = await import(pathToFileURL(entry).href)
    if (typeof core.boot !== 'function') { throw new TypeError(`core entry has no boot(): ${entry}`) }
    await core.boot({
      artifactRoot: candidate.root,
      builtinRoot,
      builtinVersion,
      effectiveVersion: candidate.version,
      resourcesVersion: resourcesVersion(),
      updaterDir: dir,
    })
  },
}).catch((error) => {
  logLine(dir, `launcher bootstrap failed: ${error}`)
})
