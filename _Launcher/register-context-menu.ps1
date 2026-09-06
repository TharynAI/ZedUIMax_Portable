param(
    [switch]$Unregister,
    [switch]$DryRun
)

$ErrorActionPreference = 'Stop'

$verbName = 'ZedUIMax_Portable_Sessions'
$menuText = 'ZedUIMax Portable'
$icon = 'shell32.dll,294'

function Resolve-ProjectRoot {
    $scriptDir = Split-Path -Parent $PSCommandPath
    $root = Split-Path -Parent $scriptDir
    $packageJson = Join-Path $root 'package.json'
    if (-not (Test-Path -LiteralPath $packageJson)) {
        throw "ZedUIMax package.json not found at $packageJson. Keep this script inside _Launcher under the app root."
    }
    return $root
}

function Get-RegistryTargets {
    param([string]$Verb)
    return @(
        [pscustomobject]@{
            Label = 'folder background'
            Path = "Software\Classes\Directory\Background\shell\$Verb"
        },
        [pscustomobject]@{
            Label = 'folder'
            Path = "Software\Classes\Directory\shell\$Verb"
        }
    )
}

function Set-ContextMenuKey {
    param(
        [string]$Path,
        [string]$Text,
        [string]$IconValue,
        [string]$Command
    )

    $baseKey = [Microsoft.Win32.Registry]::CurrentUser.CreateSubKey($Path)
    if (-not $baseKey) {
        throw "Failed to open HKCU:\$Path"
    }
    try {
        $baseKey.SetValue('', $Text, [Microsoft.Win32.RegistryValueKind]::String)
        $baseKey.SetValue('MUIVerb', $Text, [Microsoft.Win32.RegistryValueKind]::String)
        $baseKey.SetValue('Icon', $IconValue, [Microsoft.Win32.RegistryValueKind]::String)
        $commandKey = $baseKey.CreateSubKey('command')
        if (-not $commandKey) {
            throw "Failed to open HKCU:\$Path\command"
        }
        try {
            $commandKey.SetValue('', $Command, [Microsoft.Win32.RegistryValueKind]::String)
        } finally {
            $commandKey.Close()
        }
    } finally {
        $baseKey.Close()
    }
}

function Remove-ContextMenuKey {
    param([string]$Path)

    try {
        [Microsoft.Win32.Registry]::CurrentUser.DeleteSubKeyTree($Path, $false)
    } catch {
        throw "Failed to remove HKCU:\$Path. $($_.Exception.Message)"
    }
}

$projectRoot = Resolve-ProjectRoot
$vbsPath = Join-Path $projectRoot '_Launcher\zeduimax-launcher.vbs'
if (-not (Test-Path -LiteralPath $vbsPath)) {
    throw "Launcher VBS not found at $vbsPath."
}

$command = 'wscript.exe //B //nologo "{0}"' -f $vbsPath
$targets = Get-RegistryTargets -Verb $verbName

if ($Unregister) {
    foreach ($target in $targets) {
        if ($DryRun) {
            Write-Host "Would remove HKCU:\$($target.Path)"
        } else {
            Remove-ContextMenuKey -Path $target.Path
            Write-Host "Removed HKCU:\$($target.Path)"
        }
    }
    exit 0
}

foreach ($target in $targets) {
    if ($DryRun) {
        Write-Host "Would register $($target.Label): HKCU:\$($target.Path)"
        Write-Host "  Text: $menuText"
        Write-Host "  Command: $command"
    } else {
        Set-ContextMenuKey -Path $target.Path -Text $menuText -IconValue $icon -Command $command
        Write-Host "Registered $($target.Label): HKCU:\$($target.Path)"
    }
}

Write-Host "ZedUIMax Portable context menu command: $command"
