param([switch]$Before, [int]$DebugPort=9247,[int]$MonitorX=0)
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot '038-evidence.ps1')
$env:ZEDUI_CU_MONITOR_X=[string]$MonitorX
$root=Split-Path $PSScriptRoot -Parent
function GuardIdle {
 Assert-CuBudget
 $json=& (Join-Path $PSScriptRoot 'cu-window.ps1') -Action idle
 $idle=$json|ConvertFrom-Json
 $tick=Join-Path $PSScriptRoot 'cu-input-tick.txt'
 $explicitGo=$env:ZEDUI_CU_EXPLICIT_GO_UNTIL-and[DateTime]::UtcNow.Ticks-lt[long]$env:ZEDUI_CU_EXPLICIT_GO_UNTIL
 if(-not$explicitGo-and$idle.idleMs-lt120000-and(-not(Test-Path $tick)-or$idle.tick-ne[uint32](Get-Content $tick))){throw "PAUSE new input: idle $($idle.idleMs)ms"}
 if(@(Get-Process -Name PickerHost,CredentialUIBroker -ErrorAction SilentlyContinue).Count){throw 'PAUSE new security prompt'}
}
GuardIdle
$package=if($Before){Join-Path $PSScriptRoot 'machine-before-package'}else{Join-Path $root 'release\win-unpacked'}
$exe=Join-Path $package 'ZedUI Session Launcher.exe'
if(-not(Test-Path -LiteralPath $exe)){throw 'Expected package missing'}
$data=Join-Path ([IO.Path]::GetTempPath()) ('zedui-popup-machine-'+[Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $data|Out-Null
function WriteJson($file,$value){[IO.File]::WriteAllText($file,($value|ConvertTo-Json -Depth 30),(New-Object Text.UTF8Encoding($false)))}
$settings=Get-Content -LiteralPath (Join-Path $root 'data\settings.json') -Raw|ConvertFrom-Json
$config=$settings.portableConfig
$config.appRoot=$package
$config.dataRoot=$data
$config.defaultWorkspaceWin=Join-Path $data 'Workspace with spaces'
$config.machine.machineId='machine-ui-acceptance'
New-Item -ItemType Directory -Path $config.defaultWorkspaceWin|Out-Null
WriteJson (Join-Path $data 'settings.json') @{portableConfig=$config;providerFilter='all';defaultDaysFilter=30;zoomLevel=1;sidebarWidth=440;windowBounds=@{x=$MonitorX+40;y=40;width=1700;height=1100}}
$sharedFile=if($env:ZEDBANG_PATHS){$env:ZEDBANG_PATHS}else{Join-Path $root '..\..\..\Projects\.config\zedbang-paths.json'}
$shared=Get-Content -LiteralPath $sharedFile -Raw|ConvertFrom-Json
$shared.zeduiDb=Join-Path $data 'zedui.db'
WriteJson (Join-Path $data 'shared-paths.json') $shared
$env:ZEDUI_DATA_ROOT=$data
$env:ZEDUI_ALLOW_EXTERNAL_DATA_ROOT='1'
$env:ZEDBANG_PATHS=Join-Path $data 'shared-paths.json'
Remove-Item Env:ZEDUI_APP_ROOT,Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
GuardIdle
$p=Start-Process -FilePath $exe -ArgumentList @("--remote-debugging-port=$DebugPort",'--remote-debugging-address=127.0.0.1','--enable-logging',('"--log-file='+ (Join-Path $data 'electron-debug.log')+'"')) -RedirectStandardOutput (Join-Path $data 'stdout.log') -RedirectStandardError (Join-Path $data 'stderr.log') -PassThru
Write-CuEvidence 'app-launched' @{pid=$p.Id;exe=$exe;data=$data;port=$DebugPort}
@{pid=$p.Id;exe=$exe;data=$data;workspace=$config.defaultWorkspaceWin;port=$DebugPort;before=[bool]$Before}|ConvertTo-Json -Compress
try{for($i=0;$i-lt100;$i++){Assert-CuBudget;$p.Refresh();if($p.HasExited){throw 'Acceptance app exited'};if($p.MainWindowHandle-ne[IntPtr]::Zero){
 $ready=$false
 for($attempt=0;$attempt-lt5;$attempt++){
  Assert-CuBudget
  $p.Refresh();if($p.HasExited){throw 'Acceptance app exited during CDP readiness'}
  $listeners=@(Get-NetTCPConnection -State Listen -LocalPort $DebugPort -ErrorAction SilentlyContinue)
  if($listeners.Count-and-not@($listeners|Where-Object{$_.OwningProcess-eq$p.Id}).Count){throw 'Private CDP port belongs to another process'}
  if($listeners.Count){
   $health=& node (Join-Path $PSScriptRoot 'popup-machine-ui.cjs') $DebugPort --health
   if($LASTEXITCODE-eq0){$ready=$true;break}
  }
  Write-CuEvidence 'app-cdp-wait' @{pid=$p.Id;port=$DebugPort;attempt=$attempt;ownedListener=[bool]$listeners.Count}
  Start-Sleep -Milliseconds 200
 }
 if(-not$ready){throw 'Private CDP/renderer readiness failed before input'}
 Write-CuEvidence 'app-cdp-ready' @{pid=$p.Id;port=$DebugPort;health=($health|ConvertFrom-Json)}
 & (Join-Path $PSScriptRoot 'cu-window.ps1') -Action move -Handle ([long]$p.MainWindowHandle) -MoveX ($MonitorX+40) -MoveY 40 -Width 1700 -Height 1100
 if($LASTEXITCODE-ne0){throw 'Window position guard failed'}
 @{pid=$p.Id;hwnd=[long]$p.MainWindowHandle;exe=$exe;data=$data;workspace=$config.defaultWorkspaceWin;port=$DebugPort;before=[bool]$Before}|ConvertTo-Json -Compress
 return
 };Start-Sleep -Milliseconds 100}
throw 'Acceptance window not ready'
}catch{
 Write-CuEvidence 'app-startup-failed' @{pid=$p.Id;data=$data;port=$DebugPort;reason=$_.Exception.Message}
 $p.Refresh()
 if(-not$p.HasExited-and$p.MainWindowHandle-ne[IntPtr]::Zero){
  $requested=$p.CloseMainWindow();$exited=$p.WaitForExit(5000)
  Write-CuEvidence 'app-startup-cleanup' @{pid=$p.Id;closeRequested=$requested;exited=$exited}
 }
 throw
}
