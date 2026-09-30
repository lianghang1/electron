// 打破窗口遮挡（visibilityState 失真时用）：ShowWindow 还原 + SetForegroundWindow，再查 shell visibilityState
// 已知环境噪声：全屏浮层窗（授权弹窗/菜单）打开期间会遮住主窗，Chromium 遮挡检测使
// 主窗 visibilityState=hidden —— 视觉上无影响（DWM 合成保留内容显示），断言勿依赖该值
import { execSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { connect, evalx, pages, sleep } from './_lib.mjs'

const dir = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(dir, '../..')

const ps = `
Add-Type -MemberDefinition '[DllImport("user32.dll")] public static extern bool MoveWindow(IntPtr h, int x, int y, int w, int hh, bool r); [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h); [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int c);' -Name U32 -Namespace W
$p = Get-Process electron -ErrorAction SilentlyContinue | Where-Object { $_.Path -like "${root.replace(/\\/g, '\\\\')}*" -and $_.MainWindowHandle -ne 0 } | Select-Object -First 1
if (-not $p) { Write-Host 'window not found'; exit 1 }
$h = $p.MainWindowHandle
[W.U32]::ShowWindow($h, 6) | Out-Null
Start-Sleep -Milliseconds 350
[W.U32]::ShowWindow($h, 9) | Out-Null
[W.U32]::SetForegroundWindow($h) | Out-Null
'moved+front'
`
console.log(execSync(`powershell -ExecutionPolicy Bypass -Command "${ps.replace(/"/g, '\\"').replace(/\n/g, '; ')}"`, { encoding: 'utf8' }))

await sleep(900)
const { shell } = await pages()
const p = await connect(shell.webSocketDebuggerUrl)
const r = await evalx(p, 'document.visibilityState')
console.log('shell visibilityState:', r.value)
p.ws.close()
