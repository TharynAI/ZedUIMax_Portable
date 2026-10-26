param([int]$MaxSeconds=450,[switch]$UserReadyNow,[switch]$AdvisoryInputSignal,[string]$RequestPath='',[int]$MonitorX=2560)
$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
. (Join-Path $PSScriptRoot '038-evidence.ps1')
$env:ZEDUI_CU_EVIDENCE_DIR=Join-Path $PSScriptRoot ('038-evidence-'+[DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss')+'-'+[Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $env:ZEDUI_CU_EVIDENCE_DIR|Out-Null
@{evidence=$env:ZEDUI_CU_EVIDENCE_DIR}|ConvertTo-Json -Compress
$env:ZEDUI_CU_MONITOR_X=[string]$MonitorX
$cu=Join-Path $PSScriptRoot 'cu-window.ps1'
$tick=Join-Path $PSScriptRoot 'cu-input-tick.txt'
$request=if($RequestPath){$RequestPath}else{Join-Path $PSScriptRoot '038-control-request.json'}
$until=(Get-Date).AddSeconds($MaxSeconds)
$env:ZEDUI_CU_DEADLINE=[string]$until.ToUniversalTime().Ticks
if($AdvisoryInputSignal){
 if(-not$UserReadyNow-or$MaxSeconds-gt240){throw 'Advisory idle requires explicit Tharyn GO and a window of at most240 seconds'}
 $env:ZEDUI_CU_EXPLICIT_GO_UNTIL=[string]$until.ToUniversalTime().Ticks
}
$ready=$false;$last=0;$appHandle=0;$known=@()
if($UserReadyNow){
 # Explicit Tharyn GO starts this one bounded window; subsequent tick changes still stop input.
 $idle=(& $cu -Action idle)|ConvertFrom-Json
 Set-Content -LiteralPath $tick -Value ([string]$idle.tick)
 $ready=$true
 'READY explicit Tharyn GO; new input still pauses each command'
}
while((Get-Date)-lt$until){
 if((Test-Path $request)-and((Get-Content $request -Raw|ConvertFrom-Json).phase-eq'exit')){'CONTROL EXIT';exit 0}
 if(-not$ready){
  $idle=(& $cu -Action idle)|ConvertFrom-Json
  @{phase='wait-idle';idleMs=$idle.idleMs}|ConvertTo-Json -Compress
  if($idle.idleMs-lt120000){Start-Sleep -Seconds 30;continue}
  'READY idle>=120s; awaiting leased launch command';$ready=$true
 }
 if(-not(Test-Path $request)){Start-Sleep -Milliseconds 200;continue}
 $r=Get-Content $request -Raw|ConvertFrom-Json
 if($r.seq-le$last){Start-Sleep -Milliseconds 200;continue};$last=$r.seq
 if($r.phase-eq'exit'){'CONTROL EXIT';exit 0}
 try{
  $env:ZEDUI_CU_PHASE_DEADLINE=[string]([DateTime]::UtcNow.AddSeconds(50).Ticks)
  Assert-CuBudget
  $env:ZEDUI_CU_PHASE=[string]$r.phase
  $env:ZEDUI_CU_TARGET=''
  Write-CuEvidence 'phase-started' @{phase=$r.phase;seq=$r.seq}
  if(@(Get-Process PickerHost,CredentialUIBroker -ErrorAction SilentlyContinue).Count){throw 'Security prompt; stop'}
  switch($r.phase){
   'probe'{
    for($j=0;$j-lt5;$j++){
     $info=New-Object CU+LII;$info.cb=8;$ok=[CU]::GetLastInputInfo([ref]$info)
     @{phase='input-probe';ok=$ok;tick=$info.t;now=[CU]::GetTickCount();recorded=(Get-Content $tick)}|ConvertTo-Json -Compress
     Start-Sleep -Seconds 1
    }
   }
   'launch'{
    $out=@(& (Join-Path $PSScriptRoot 'launch-popup-machine-acceptance.ps1') -DebugPort 9247 -MonitorX $MonitorX)
    $out|ForEach-Object{Write-Output $_}
    $rows=@($out|Where-Object{$_-is[string]-and$_.StartsWith('{')}|ForEach-Object{$_|ConvertFrom-Json})
    $appHandle=[long](@($rows|Where-Object{$_.hwnd})[-1].hwnd);$known+= $appHandle
   }
   'new'{
    if(-not$appHandle){throw 'Own app missing'}
    $out=@(& (Join-Path $PSScriptRoot 'native-new-check.ps1') -Provider Claude2 -Handle $appHandle -Port 9247 -MonitorX $MonitorX -NoCapture)
    $out|ForEach-Object{Write-Output $_}
    if($LASTEXITCODE-ne0){throw 'NativeNew failed; inspect before any retry'}
    $rows=@($out|Where-Object{$_-is[string]-and$_.StartsWith('{')}|ForEach-Object{$_|ConvertFrom-Json})
    $new=@($rows|Where-Object{$_.provider-eq'Claude2'})[0]
    if(@($new.newWindows).Count-ne1){throw 'Own terminal identity missing'}
    $known+=[long]$new.newWindows[0].hwnd
   }
   'select'{
    & (Join-Path $PSScriptRoot 'native-038-resume.ps1') -Action Select -Handle $appHandle -Port 9247 -MonitorX $MonitorX -SessionId $r.sessionId
    if($LASTEXITCODE-ne0){throw 'Native Select failed'}
   }
   'resume'{
    $out=@(& (Join-Path $PSScriptRoot 'native-038-resume.ps1') -Action Resume -Handle $appHandle -Port 9247 -MonitorX $MonitorX -SessionId $r.sessionId)
    $out|ForEach-Object{Write-Output $_}
    if($LASTEXITCODE-ne0){throw 'Native Resume failed'}
    $rows=@($out|Where-Object{$_-is[string]-and$_.StartsWith('{')}|ForEach-Object{$_|ConvertFrom-Json})
    $new=@($rows|Where-Object{$_.action-eq'resumed'})[0]
    $known+=[long]$new.terminal.hwnd
   }
   'capture'{
    if([long]$r.handle-notin$known){throw 'Unknown HWND'}
    & $cu -Action raise -Handle $r.handle -TickFile $tick
    if($LASTEXITCODE){throw 'Raise refused'}
    & $cu -Action focus -Handle $r.handle -TickFile $tick
    if($LASTEXITCODE){throw 'Focus refused'}
    & $cu -Action capture -Handle $r.handle -ImagePath (Join-Path $PSScriptRoot $r.image)
    if($LASTEXITCODE){throw 'Capture refused'}
    & $cu -Action untop -Handle $r.handle -TickFile $tick
   }
   'type'{
    if([long]$r.handle-notin$known){throw 'Unknown HWND'}
    & $cu -Action raise -Handle $r.handle -TickFile $tick
    if($LASTEXITCODE){throw 'Raise refused'}
    & $cu -Action focus -Handle $r.handle -TickFile $tick
    if($LASTEXITCODE){throw 'Focus refused'}
    & $cu -Action type -Handle $r.handle -Text $r.text -TickFile $tick
    if($LASTEXITCODE){throw 'Type refused'}
    & $cu -Action untop -Handle $r.handle -TickFile $tick
   }
   'close'{
    if([long]$r.handle-notin$known){throw 'Unknown HWND'}
    & $cu -Action close -Handle $r.handle
   }
   default{throw 'Unknown control phase'}
  }
  Write-CuEvidence 'phase-completed' @{phase=$r.phase;seq=$r.seq;appHandle=$appHandle;knownHandles=$known}
  @{phase=$r.phase;seq=$r.seq;result='DONE';appHandle=$appHandle;knownHandles=$known}|ConvertTo-Json -Compress
 }catch{ Write-CuEvidence 'phase-failed' @{phase=$r.phase;seq=$r.seq;error=$_.Exception.Message};@{phase=$r.phase;seq=$r.seq;error=$_.Exception.Message}|ConvertTo-Json -Compress }
}
'CONTROL TIMEOUT';exit 2
