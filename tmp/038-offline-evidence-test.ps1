$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot '038-evidence.ps1')
$oldDirectory=$env:ZEDUI_CU_EVIDENCE_DIR
$oldDeadline=$env:ZEDUI_CU_DEADLINE
$oldPhaseDeadline=$env:ZEDUI_CU_PHASE_DEADLINE
$directory=Join-Path $PSScriptRoot ('038-offline-fixture-'+[Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $directory|Out-Null
try {
 $env:ZEDUI_CU_EVIDENCE_DIR=$directory
 Remove-Item Env:ZEDUI_CU_PHASE_DEADLINE -ErrorAction SilentlyContinue
 $env:ZEDUI_CU_DEADLINE=[string][DateTime]::UtcNow.AddSeconds(10).Ticks
 Assert-CuBudget
 Write-CuEvidence 'started' @{id='fixture';action='test-only'}
 if(-not(Test-Path (Join-Path $directory 'steps.jsonl'))){throw 'Started event was not persisted immediately'}
 try {throw 'fixture failure'} catch {Write-CuEvidence 'failed' @{id='fixture';reason=$_.Exception.Message}}
 $events=@(Get-Content (Join-Path $directory 'steps.jsonl')|ForEach-Object{$_|ConvertFrom-Json})
 if($events.Count-ne2-or$events[0].stage-ne'started'-or$events[1].stage-ne'failed'){throw 'Partial-failure evidence missing'}
 $env:ZEDUI_CU_DEADLINE='1'
 $blocked=$false
 try {Assert-CuBudget}catch{$blocked=$_.Exception.Message-like'*deadline expired*'}
 if(-not$blocked){throw 'Expired deadline was not blocked'}
 $env:ZEDUI_CU_DEADLINE=[string][DateTime]::UtcNow.AddSeconds(10).Ticks
 $env:ZEDUI_CU_PHASE_DEADLINE='1';$phaseBlocked=$false
 try {Assert-CuBudget}catch{$phaseBlocked=$_.Exception.Message-like'*deadline expired*'}
 if(-not$phaseBlocked){throw 'Expired phase was not blocked'}
 $idle=& (Join-Path $PSScriptRoot 'cu-window.ps1') -Action idle
 if($LASTEXITCODE){throw 'Read-only Win32 compilation/idle failed'}
 $scripts=@('cu-window.ps1','038-evidence.ps1','038-control-host.ps1','native-new-check.ps1','native-038-resume.ps1','launch-popup-machine-acceptance.ps1')
 foreach($name in $scripts){
  $tokens=$null;$errors=$null
  [void][System.Management.Automation.Language.Parser]::ParseFile((Join-Path $PSScriptRoot $name),[ref]$tokens,[ref]$errors)
  if($errors.Count){throw ($errors|Out-String)}
 }
 @{passed=$true;checks=@('future-budget','durable-start','durable-failure','expired-budget','expired-phase','read-only-Win32','six-script-syntax');fixture=$directory;screenInput=$false;capture=$false}|ConvertTo-Json -Compress
}finally{
 $env:ZEDUI_CU_EVIDENCE_DIR=$oldDirectory
 $env:ZEDUI_CU_DEADLINE=$oldDeadline
 $env:ZEDUI_CU_PHASE_DEADLINE=$oldPhaseDeadline
}
