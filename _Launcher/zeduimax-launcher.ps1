param()

$ErrorActionPreference = 'Stop'

function Get-LauncherLogPath {
    $candidates = @(
        $env:TEMP,
        $env:TMP,
        [System.IO.Path]::GetTempPath(),
        'C:\Windows\Temp'
    ) | Select-Object -Unique

    foreach ($dir in $candidates) {
        if ([string]::IsNullOrWhiteSpace($dir)) {
            continue
        }
        if (Test-Path $dir) {
            return Join-Path $dir 'zeduimax-launcher.log'
        }
    }

    return 'C:\zeduimax-launcher.log'
}

$logPath = Get-LauncherLogPath

function Write-LauncherLog {
    param([string]$Message)
    $line = "[{0}] {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Message
    Add-Content -Path $logPath -Value $line -Encoding UTF8
}

function Show-LauncherError {
    param(
        [string]$Message,
        [string]$LogPath
    )

    Add-Type -AssemblyName System.Windows.Forms
    $detail = $Message
    if ($LogPath) {
        $detail += "`n`nLog: $LogPath"
    }

    [System.Windows.Forms.MessageBox]::Show(
        $detail,
        "ZedUIMax Launcher Error",
        [System.Windows.Forms.MessageBoxButtons]::OK,
        [System.Windows.Forms.MessageBoxIcon]::Error
    ) | Out-Null
}

function Get-ZedUIMaxRoot {
    param([string]$ScriptDir)
    $fromScript = Split-Path -Parent $ScriptDir
    $candidates = @(
        $fromScript,
        'E:\ZedBang\ZedUIMax',
        'D:\ZedBang\ZedUIMax',
        'C:\ZedBang\ZedUIMax'
    ) | Select-Object -Unique

    foreach ($candidate in $candidates) {
        if ([string]::IsNullOrWhiteSpace($candidate)) {
            continue
        }
        if (Test-Path (Join-Path $candidate 'package.json')) {
            return $candidate
        }
    }

    throw "ZedUIMax install path not found. Checked: $($candidates -join ', ')"
}

function Find-WindowsElectron {
    param([string]$ProjectWinPath)
    $siblingRoot = Split-Path -Parent $ProjectWinPath
    $candidates = @(
        (Join-Path $ProjectWinPath 'node_modules\electron\dist\electron.exe'),
        (Join-Path $siblingRoot 'ZedUI\node_modules\electron\dist\electron.exe')
    ) | Select-Object -Unique

    foreach ($candidate in $candidates) {
        if (Test-Path $candidate) {
            return $candidate
        }
    }
    return $null
}

function Reset-WindowBounds {
    param([string]$ProjectWinPath)
    $settingsPath = Join-Path $ProjectWinPath 'data\settings.json'
    if (-not (Test-Path $settingsPath)) {
        return
    }

    try {
        $settings = Get-Content -Path $settingsPath -Raw | ConvertFrom-Json
        $settings.windowBounds = [pscustomobject]@{
            x = 120
            y = 80
            width = 1497
            height = 1001
        }
        $settingsJson = $settings | ConvertTo-Json -Depth 20
        $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
        [System.IO.File]::WriteAllText($settingsPath, $settingsJson, $utf8NoBom)
        Write-LauncherLog "Window bounds reset in $settingsPath"
    } catch {
        Write-LauncherLog "Window bounds reset skipped: $($_.Exception.Message)"
    }
}

function Stop-StaleZedUIMaxWindowsInstances {
    param([string]$ProjectWinPath)
    $all = Get-CimInstance Win32_Process -Filter "Name = 'electron.exe'" -ErrorAction SilentlyContinue
    if (-not $all) {
        return
    }

    $killed = 0
    foreach ($proc in $all) {
        if ($proc.CommandLine -and $proc.CommandLine.IndexOf($ProjectWinPath, [System.StringComparison]::OrdinalIgnoreCase) -ge 0) {
            try {
                Stop-Process -Id $proc.ProcessId -Force -ErrorAction SilentlyContinue
                $killed++
            } catch {
                Write-LauncherLog "Unable to stop stale process $($proc.ProcessId): $($_.Exception.Message)"
            }
        }
    }

    if ($killed -gt 0) {
        Write-LauncherLog "Stopped $killed stale ZedUIMax Windows process(es)"
    }
}

function Get-ElectronVersion {
    param([string]$ProjectWinPath)
    $electronPackage = Join-Path $ProjectWinPath 'node_modules\electron\package.json'
    if (-not (Test-Path $electronPackage)) {
        throw "Electron package metadata not found at $electronPackage"
    }

    $pkg = Get-Content -Path $electronPackage -Raw | ConvertFrom-Json
    if ([string]::IsNullOrWhiteSpace($pkg.version)) {
        throw "Unable to determine Electron version from $electronPackage"
    }

    return [string]$pkg.version
}

function Ensure-ElectronNativeModules {
    param([string]$ProjectWinPath)

    $npm = Get-Command npm.cmd -ErrorAction SilentlyContinue
    if (-not $npm) {
        throw "npm.cmd not found on PATH; cannot prepare Electron native modules."
    }

    $electronVersion = Get-ElectronVersion -ProjectWinPath $ProjectWinPath
    Write-LauncherLog "Ensuring better-sqlite3 is rebuilt for Electron $electronVersion"

    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = $npm.Source
    $psi.Arguments = "rebuild better-sqlite3 --runtime=electron --target=$electronVersion --disturl=https://electronjs.org/headers"
    $psi.WorkingDirectory = $ProjectWinPath
    $psi.UseShellExecute = $false
    $psi.RedirectStandardOutput = $true
    $psi.RedirectStandardError = $true
    $psi.CreateNoWindow = $true

    $proc = [System.Diagnostics.Process]::Start($psi)
    $stdout = $proc.StandardOutput.ReadToEnd()
    $stderr = $proc.StandardError.ReadToEnd()
    $proc.WaitForExit()

    if ($stdout.Trim()) {
        Write-LauncherLog "native rebuild stdout: $($stdout.Trim())"
    }
    if ($stderr.Trim()) {
        Write-LauncherLog "native rebuild stderr: $($stderr.Trim())"
    }
    if ($proc.ExitCode -ne 0) {
        throw "Electron native module rebuild failed with exit code $($proc.ExitCode)."
    }
}

function Set-ContextMenuCommandScope {
    param(
        [string]$ScopePrefix,
        [string]$LaunchCommand
    )

    if ($ScopePrefix -eq 'HKLM') {
        $basePath = 'HKLM\SOFTWARE\Classes'
    } else {
        $basePath = 'HKCU\Software\Classes'
    }

    $bgKey = "$basePath\Directory\Background\shell\ZedUIMax_Sessions"
    $bgCmdKey = "$bgKey\command"
    $folderKey = "$basePath\Directory\shell\ZedUIMax_Sessions"
    $folderCmdKey = "$folderKey\command"

    & reg.exe add $bgKey /ve /d "ZedUIMax Sessions" /f 2>$null | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Failed to write $bgKey" }
    & reg.exe add $bgKey /v Icon /t REG_SZ /d "shell32.dll,294" /f 2>$null | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Failed to write icon for $bgKey" }
    & reg.exe add $bgCmdKey /ve /d $LaunchCommand /f 2>$null | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Failed to write command for $bgCmdKey" }

    & reg.exe add $folderKey /ve /d "ZedUIMax Sessions" /f 2>$null | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Failed to write $folderKey" }
    & reg.exe add $folderKey /v Icon /t REG_SZ /d "shell32.dll,294" /f 2>$null | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Failed to write icon for $folderKey" }
    & reg.exe add $folderCmdKey /ve /d $LaunchCommand /f 2>$null | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Failed to write command for $folderCmdKey" }
}

function Ensure-ContextMenuRegistry {
    param([string]$VbsPath)
    $launchCommand = "wscript.exe //B //nologo `"$VbsPath`""

    $updatedAny = $false
    foreach ($scope in @('HKLM', 'HKCU')) {
        try {
            Set-ContextMenuCommandScope -ScopePrefix $scope -LaunchCommand $launchCommand
            Write-LauncherLog "Context-menu entries ensured in $scope"
            $updatedAny = $true
        } catch {
            Write-LauncherLog "Context-menu update failed for ${scope}: $($_.Exception.Message)"
        }
    }

    if (-not $updatedAny) {
        Write-LauncherLog "Context-menu self-heal skipped (insufficient registry write rights)"
    }
}

try {
    if (Test-Path $logPath) {
        Remove-Item -Path $logPath -Force -ErrorAction SilentlyContinue
    }

    $scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
    $projectWinPath = Get-ZedUIMaxRoot -ScriptDir $scriptDir
    $vbsPath = Join-Path $scriptDir 'zeduimax-launcher.vbs'

    Write-LauncherLog "Launcher script directory: $scriptDir"
    Write-LauncherLog "Resolved project path: $projectWinPath"

    Ensure-ContextMenuRegistry -VbsPath $vbsPath
    Stop-StaleZedUIMaxWindowsInstances -ProjectWinPath $projectWinPath
    Ensure-ElectronNativeModules -ProjectWinPath $projectWinPath
    Reset-WindowBounds -ProjectWinPath $projectWinPath

    $electronExe = Find-WindowsElectron -ProjectWinPath $projectWinPath
    if (-not $electronExe) {
        throw "Windows Electron runtime not found. Checked ZedUIMax and sibling ZedUI paths."
    }

    Write-LauncherLog "Launching with Windows Electron: $electronExe"
    $proc = Start-Process -FilePath $electronExe `
        -ArgumentList @('.', '--no-sandbox', '--remote-debugging-port=9223', '--disable-gpu') `
        -WorkingDirectory $projectWinPath `
        -PassThru

    Start-Sleep -Milliseconds 900
    $running = Get-Process -Id $proc.Id -ErrorAction SilentlyContinue
    if (-not $running) {
        throw "Launch process exited immediately (PID $($proc.Id))."
    }

    Write-LauncherLog "Launch succeeded with PID $($proc.Id)"
} catch {
    $msg = $_.Exception.Message
    if (Test-Path $logPath) {
        $tail = Get-Content -Path $logPath -Tail 40 -ErrorAction SilentlyContinue
        if ($tail) {
            $msg += "`n`nRecent output:`n" + ($tail -join "`n")
        }
    }
    Show-LauncherError -Message $msg -LogPath $logPath
    exit 1
}

exit 0
