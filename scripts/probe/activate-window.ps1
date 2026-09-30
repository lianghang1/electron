# 激活 Desktop 主窗（ShowWindow 最小化→还原）：回归探针前置，避免窗口被遮挡影响断言
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class WA {
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int cmd);
}
"@
$root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$p = Get-Process electron -ErrorAction SilentlyContinue | Where-Object { $_.Path -like "$root*" -and $_.MainWindowHandle -ne 0 } | Select-Object -First 1
if (-not $p) { Write-Host 'window not found'; exit 1 }
$h = $p.MainWindowHandle
[WA]::ShowWindow($h, 6) | Out-Null
Start-Sleep -Milliseconds 350
[WA]::ShowWindow($h, 9) | Out-Null
Start-Sleep -Milliseconds 600
Write-Host "activated hwnd=$h"
