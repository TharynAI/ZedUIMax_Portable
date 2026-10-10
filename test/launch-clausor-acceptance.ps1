param([int]$DebugPort = 9247, [int]$MonitorX = 2560, [int]$MonitorY = 0)
$ErrorActionPreference = 'Stop'
function Write-AcceptanceJson($File, $Value) {
    [IO.File]::WriteAllText($File, ($Value | ConvertTo-Json -Depth 20), (New-Object Text.UTF8Encoding($false)))
}
$root = Split-Path $PSScriptRoot -Parent
$exe = Join-Path $root 'release\win-unpacked\ZedUI Session Launcher.exe'
if (-not (Test-Path -LiteralPath $exe)) { throw 'Build the Windows package first.' }
$data = Join-Path ([IO.Path]::GetTempPath()) ('zedui-clausor-acceptance-' + [Guid]::NewGuid())
New-Item -ItemType Directory -Path $data | Out-Null
$existing = Get-Content -LiteralPath (Join-Path $root 'data\settings.json') -Raw | ConvertFrom-Json
$config = $existing.portableConfig
if (-not $config) { throw 'Acceptance needs an already configured local provider setup.' }
$config.appRoot = Split-Path $exe -Parent
$config.dataRoot = $data
$config.defaultWorkspaceWin = Join-Path $data 'Workspace with spaces'
New-Item -ItemType Directory -Path $config.defaultWorkspaceWin | Out-Null
Write-AcceptanceJson (Join-Path $data 'settings.json') @{ portableConfig = $config; providerFilter = 'clausor'; defaultDaysFilter = 30; zoomLevel = 1.0; sidebarWidth = 440 }
$sharedFile = if ($env:ZEDBANG_PATHS) { $env:ZEDBANG_PATHS } else {
    Join-Path (Join-Path $root '..\..\..\Projects') '.config\zedbang-paths.json'
}
$shared = Get-Content -LiteralPath $sharedFile -Raw | ConvertFrom-Json
$shared.zeduiDb = Join-Path $data 'zedui.db'
Write-AcceptanceJson (Join-Path $data 'shared-paths.json') $shared
$env:ZEDUI_DATA_ROOT = $data
$env:ZEDUI_ALLOW_EXTERNAL_DATA_ROOT = '1'
$env:ZEDBANG_PATHS = Join-Path $data 'shared-paths.json'
Remove-Item Env:ZEDUI_APP_ROOT -ErrorAction SilentlyContinue
$proc = Start-Process -FilePath $exe -ArgumentList "--remote-debugging-port=$DebugPort" -PassThru
@{ pid = $proc.Id; exe = $exe; data = $data; workspace = $config.defaultWorkspaceWin; port = $DebugPort } | ConvertTo-Json -Compress
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class AcceptanceWindow {
  [DllImport("user32.dll")] public static extern bool MoveWindow(IntPtr h, int x, int y, int w, int height, bool repaint);
}
'@
for ($i = 0; $i -lt 100; $i++) {
    $proc.Refresh()
    if ($proc.HasExited) { throw 'Packaged application exited before creating a window.' }
    if ($proc.MainWindowHandle -ne [IntPtr]::Zero) {
        if (-not [AcceptanceWindow]::MoveWindow($proc.MainWindowHandle, $MonitorX + 40, $MonitorY + 40, 1700, 1100, $true)) {
            throw 'Could not position the acceptance window.'
        }
        return
    }
    Start-Sleep -Milliseconds 100
}
throw 'Packaged application did not create a window in 10 seconds.'
