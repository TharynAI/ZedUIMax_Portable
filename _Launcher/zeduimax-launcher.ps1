param(
    [switch]$NoInstall,
    [switch]$NoBuild,
    [switch]$RebuildNative,
    [switch]$NoKill,
    [switch]$NoDebug,
    [int]$DebugPort = 9233
)

$ErrorActionPreference = 'Stop'

function Resolve-ProjectRoot {
    $scriptDir = Split-Path -Parent $PSCommandPath
    $root = Split-Path -Parent $scriptDir
    $packageJson = Join-Path $root 'package.json'
    if (-not (Test-Path -LiteralPath $packageJson)) {
        throw "ZedUIMax package.json not found at $packageJson. Keep this launcher inside _Launcher under the app root."
    }
    return $root
}

function Ensure-Directory {
    param([string]$Path)
    if (-not (Test-Path -LiteralPath $Path)) {
        New-Item -ItemType Directory -Path $Path -Force | Out-Null
    }
}

$projectRoot = Resolve-ProjectRoot
$dataRoot = Join-Path $projectRoot 'data'
$logsRoot = Join-Path $dataRoot 'logs'
Ensure-Directory -Path $logsRoot
$logPath = Join-Path $logsRoot 'launcher.log'

function Write-LauncherLog {
    param([string]$Message)
    $line = "[{0}] {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Message
    Add-Content -Path $logPath -Value $line -Encoding UTF8
}

function ConvertTo-ProcessArgument {
    param([AllowNull()][string]$Value)
    if ($null -eq $Value) {
        return '""'
    }
    if ($Value -notmatch '[\s"]') {
        return $Value
    }
    return '"' + ($Value -replace '"', '\"') + '"'
}

function Show-LauncherError {
    param([string]$Message)
    try {
        Add-Type -AssemblyName System.Windows.Forms
        [System.Windows.Forms.MessageBox]::Show(
            "$Message`n`nLog: $logPath",
            'ZedUIMax Portable Launcher',
            [System.Windows.Forms.MessageBoxButtons]::OK,
            [System.Windows.Forms.MessageBoxIcon]::Error
        ) | Out-Null
    } catch {
        Write-Error "$Message`nLog: $logPath"
    }
}

function Invoke-LoggedProcess {
    param(
        [string]$FilePath,
        [string[]]$Arguments,
        [string]$WorkingDirectory,
        [string]$Label
    )

    Write-LauncherLog "$Label`: $FilePath $($Arguments -join ' ')"

    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = $FilePath
    $psi.Arguments = (($Arguments | ForEach-Object { ConvertTo-ProcessArgument $_ }) -join ' ')
    $psi.WorkingDirectory = $WorkingDirectory
    $psi.UseShellExecute = $false
    $psi.RedirectStandardOutput = $true
    $psi.RedirectStandardError = $true
    $psi.CreateNoWindow = $true

    $proc = [System.Diagnostics.Process]::Start($psi)
    $stdout = $proc.StandardOutput.ReadToEnd()
    $stderr = $proc.StandardError.ReadToEnd()
    $proc.WaitForExit()

    if ($stdout.Trim()) {
        Write-LauncherLog "$Label stdout: $($stdout.Trim())"
    }
    if ($stderr.Trim()) {
        Write-LauncherLog "$Label stderr: $($stderr.Trim())"
    }
    if ($proc.ExitCode -ne 0) {
        throw "$Label failed with exit code $($proc.ExitCode)."
    }
}

function Get-CommandPath {
    param([string]$Name)
    $cmd = Get-Command $Name -ErrorAction SilentlyContinue
    if (-not $cmd) {
        throw "$Name was not found on PATH."
    }
    return $cmd.Source
}

function Get-ElectronVersion {
    $electronPackage = Join-Path $projectRoot 'node_modules\electron\package.json'
    if (-not (Test-Path -LiteralPath $electronPackage)) {
        throw "Electron package metadata not found at $electronPackage."
    }
    $pkg = Get-Content -Path $electronPackage -Raw | ConvertFrom-Json
    if ([string]::IsNullOrWhiteSpace($pkg.version)) {
        throw "Unable to determine Electron version from $electronPackage."
    }
    return [string]$pkg.version
}

function Ensure-Dependencies {
    $nodeModules = Join-Path $projectRoot 'node_modules'
    if (Test-Path -LiteralPath $nodeModules) {
        return
    }
    if ($NoInstall) {
        throw "node_modules is missing. Run this launcher without -NoInstall, or run npm ci in $projectRoot."
    }
    $npm = Get-CommandPath -Name 'npm.cmd'
    Invoke-LoggedProcess -FilePath $npm -Arguments @('ci') -WorkingDirectory $projectRoot -Label 'npm ci'
}

function Ensure-NativeModules {
    $npm = Get-CommandPath -Name 'npm.cmd'
    $electronVersion = Get-ElectronVersion
    $markerPath = Join-Path $dataRoot 'native-rebuild.json'
    $needsRebuild = [bool]$RebuildNative

    if (-not $needsRebuild) {
        if (-not (Test-Path -LiteralPath $markerPath)) {
            $needsRebuild = $true
        } else {
            try {
                $marker = Get-Content -Path $markerPath -Raw | ConvertFrom-Json
                $needsRebuild = ([string]$marker.electronVersion -ne $electronVersion)
            } catch {
                $needsRebuild = $true
            }
        }
    }

    if (-not $needsRebuild) {
        Write-LauncherLog "Native rebuild marker is current for Electron $electronVersion"
        return
    }

    Invoke-LoggedProcess `
        -FilePath $npm `
        -Arguments @('rebuild', 'better-sqlite3', '--runtime=electron', "--target=$electronVersion", '--disturl=https://electronjs.org/headers') `
        -WorkingDirectory $projectRoot `
        -Label "npm rebuild better-sqlite3"

    $marker = [pscustomobject]@{
        electronVersion = $electronVersion
        rebuiltAt = (Get-Date).ToUniversalTime().ToString('o')
    }
    $marker | ConvertTo-Json | Set-Content -Path $markerPath -Encoding UTF8
}

function Ensure-BuildOutput {
    $mainFile = Join-Path $projectRoot 'dist\main\main\index.js'
    $rendererFile = Join-Path $projectRoot 'dist\renderer\index.html'
    if ((Test-Path -LiteralPath $mainFile) -and (Test-Path -LiteralPath $rendererFile)) {
        return
    }
    if ($NoBuild) {
        throw "Build output is missing. Run this launcher without -NoBuild, or run npm run build in $projectRoot."
    }
    $npm = Get-CommandPath -Name 'npm.cmd'
    Invoke-LoggedProcess -FilePath $npm -Arguments @('run', 'build') -WorkingDirectory $projectRoot -Label 'npm run build'
}

function Stop-CurrentRootElectron {
    if ($NoKill) {
        return
    }
    $all = Get-CimInstance Win32_Process -Filter "Name = 'electron.exe'" -ErrorAction SilentlyContinue
    if (-not $all) {
        return
    }

    $stopped = 0
    foreach ($proc in $all) {
        if ($proc.CommandLine -and $proc.CommandLine.IndexOf($projectRoot, [System.StringComparison]::OrdinalIgnoreCase) -ge 0) {
            Stop-Process -Id $proc.ProcessId -Force -ErrorAction SilentlyContinue
            $stopped++
        }
    }
    if ($stopped -gt 0) {
        Write-LauncherLog "Stopped $stopped existing Electron process(es) for $projectRoot"
    }
}

try {
    if (Test-Path -LiteralPath $logPath) {
        Remove-Item -LiteralPath $logPath -Force -ErrorAction SilentlyContinue
    }

    Write-LauncherLog "Project root: $projectRoot"
    Ensure-Dependencies
    Ensure-NativeModules
    Ensure-BuildOutput
    Stop-CurrentRootElectron

    $electronExe = Join-Path $projectRoot 'node_modules\electron\dist\electron.exe'
    if (-not (Test-Path -LiteralPath $electronExe)) {
        throw "Electron runtime not found at $electronExe."
    }

    $args = @('.', '--no-sandbox', '--disable-gpu')
    if (-not $NoDebug) {
        $args += "--remote-debugging-port=$DebugPort"
    }

    Write-LauncherLog "Launching: $electronExe $($args -join ' ')"
    $proc = Start-Process -FilePath $electronExe -ArgumentList $args -WorkingDirectory $projectRoot -PassThru

    Start-Sleep -Milliseconds 900
    $running = Get-Process -Id $proc.Id -ErrorAction SilentlyContinue
    if (-not $running) {
        throw "Launch process exited immediately (PID $($proc.Id))."
    }

    Write-LauncherLog "Launch succeeded with PID $($proc.Id)"
    Write-Host "ZedUIMax Portable launched from $projectRoot with PID $($proc.Id)."
    Write-Host "Log: $logPath"
} catch {
    $msg = $_.Exception.Message
    if (Test-Path -LiteralPath $logPath) {
        $tail = Get-Content -Path $logPath -Tail 40 -ErrorAction SilentlyContinue
        if ($tail) {
            $msg += "`n`nRecent output:`n" + ($tail -join "`n")
        }
    }
    Show-LauncherError -Message $msg
    exit 1
}

exit 0
